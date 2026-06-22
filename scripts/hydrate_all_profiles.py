#!/usr/bin/env python3
"""Conservative bulk hydration orchestrator for Member Command Center.

The script plans and optionally runs existing hydration runners against cached
profiles. It intentionally does not create new source pipes or mutate roster
data.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = PROJECT_ROOT / "server"
DATA_DIR = PROJECT_ROOT / "data"
STATE_PATH = DATA_DIR / "hydration_orchestration_state.json"

if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import canonical_profile_client  # noqa: E402
import congress_client  # noqa: E402
import db  # noqa: E402
import hydration_audit_client  # noqa: E402
import official_web_client  # noqa: E402
import openfec_client  # noqa: E402
import openstates_client  # noqa: E402
import race_context_client  # noqa: E402
import readiness_client  # noqa: E402
import source_coverage_client  # noqa: E402
import web_mentions_client  # noqa: E402
import youtube_client  # noqa: E402


RUNNERS = [
    "official_web_contact",
    "openfec_finance",
    "congress_legislation",
    "youtube_media",
    "web_mentions",
    "openstates_legislation",
    "race_opponent_context",
]

RUNNER_LABELS = {
    "official_web_contact": "Official Web + Contact",
    "openfec_finance": "OpenFEC Finance",
    "congress_legislation": "Congress.gov Legislation",
    "youtube_media": "YouTube Media",
    "web_mentions": "Web Mentions",
    "openstates_legislation": "OpenStates Legislation",
    "race_opponent_context": "Race + Opponent Context",
}

RUNNER_ENV_KEYS = {
    "openfec_finance": "FEC_API_KEY",
    "congress_legislation": "CONGRESS_API_KEY",
    "youtube_media": "YOUTUBE_API_KEY",
    "openstates_legislation": "OPENSTATES_API_KEY",
}

RUNNER_ALIASES = {
    "official_web": "official_web_contact",
    "official-web": "official_web_contact",
    "official_web_contact": "official_web_contact",
    "web_contact": "official_web_contact",
    "openfec": "openfec_finance",
    "openfec_finance": "openfec_finance",
    "fec": "openfec_finance",
    "campaign_finance": "openfec_finance",
    "congress": "congress_legislation",
    "congress_legislation": "congress_legislation",
    "congress.gov": "congress_legislation",
    "youtube": "youtube_media",
    "youtube_media": "youtube_media",
    "web_mentions": "web_mentions",
    "web-mentions": "web_mentions",
    "mentions": "web_mentions",
    "openstates": "openstates_legislation",
    "openstates_legislation": "openstates_legislation",
    "state_legislation": "openstates_legislation",
    "race_context": "race_opponent_context",
    "race-context": "race_opponent_context",
    "race_opponent_context": "race_opponent_context",
    "opponent": "race_opponent_context",
}

MISSING_PIPE_RUNNER_NAMES = {
    "state_local_finance_runner_needed",
    "state_local_filing_runner_needed",
    "race_rating_source_needed",
    "fact_check_runner_needed",
    "staff_network_runner_needed",
    "google_civic_election_runner_needed",
    "district_map_layer_runner_needed",
    "video_archive_runner_needed",
    "manual_research_needed",
    "internal_asset_approval_needed",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def timestamp_for_filename() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def safe_int(value: Any, default: int = 0) -> int:
    try:
        if value in (None, ""):
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def has_content(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        text = value.strip()
        return bool(text) and text.lower() not in {
            "n/a",
            "na",
            "none",
            "null",
            "unknown",
            "not populated yet",
            "not started",
            "source needed",
            "source required",
        }
    if isinstance(value, list):
        return any(has_content(item) for item in value)
    if isinstance(value, dict):
        return any(has_content(item) for item in value.values())
    return True


def first_value(*values: Any) -> str:
    for value in values:
        if has_content(value):
            return str(value).strip()
    return ""


def nested_value(source: Dict[str, Any], *path: str) -> Any:
    current: Any = source
    for key in path:
        if not isinstance(current, dict):
            return ""
        current = current.get(key)
    return current if current is not None else ""


def slugify(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def load_dotenv_file(path: Path) -> List[str]:
    loaded: List[str] = []
    if not path.exists():
        return loaded

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
            loaded.append(key)
    return loaded


def load_environment() -> Dict[str, Any]:
    loaded = []
    loaded.extend(load_dotenv_file(PROJECT_ROOT / ".env"))
    loaded.extend(load_dotenv_file(SERVER_DIR / ".env"))
    api_keys = {
        "FEC_API_KEY": bool(os.environ.get("FEC_API_KEY", "").strip()),
        "CONGRESS_API_KEY": bool(os.environ.get("CONGRESS_API_KEY", "").strip()),
        "YOUTUBE_API_KEY": bool(os.environ.get("YOUTUBE_API_KEY", "").strip()),
        "OPENSTATES_API_KEY": bool(os.environ.get("OPENSTATES_API_KEY", "").strip()),
    }
    return {"dotenv_keys_loaded": sorted(set(loaded)), "api_keys_configured": api_keys}


def load_cached_profiles(allow_initialize: bool = False) -> Tuple[List[Dict[str, Any]], str]:
    if allow_initialize:
        db.initialize_database()

    cached: List[Dict[str, Any]] = []
    if db.DB_PATH.exists():
        cached = db.list_people_cache()
        if cached:
            return [normalize_cached_profile(row) for row in cached], "people_cache"

    fallback = [
        normalize_cached_profile(db.normalize_person_for_cache(person, index))
        for index, person in enumerate(db.load_people_json())
        if isinstance(person, dict)
    ]
    return fallback, "data_people_json_fallback"


def normalize_cached_profile(row: Dict[str, Any]) -> Dict[str, Any]:
    profile_id = first_value(row.get("profile_id"), nested_value(as_dict(row.get("source_json")), "profile_id"))
    person = as_dict(row.get("source_json")).copy()
    person.setdefault("profile_id", profile_id)
    person.setdefault("id", profile_id)
    person.setdefault("displayName", first_value(row.get("display_name"), person.get("displayName"), person.get("name")))
    return {
        **row,
        "profile_id": profile_id,
        "display_name": first_value(row.get("display_name"), person.get("displayName"), profile_id),
        "source_json": person,
    }


def get_person(cached_profile: Dict[str, Any]) -> Dict[str, Any]:
    person = as_dict(cached_profile.get("source_json")).copy()
    person.setdefault("profile_id", cached_profile.get("profile_id"))
    person.setdefault("id", cached_profile.get("profile_id"))
    person.setdefault("displayName", cached_profile.get("display_name"))
    return person


def get_profile_group(person: Dict[str, Any], cached_profile: Optional[Dict[str, Any]] = None) -> str:
    cached = cached_profile or {}
    groups = collect_group_values(person, cached)
    return groups[0] if groups else "Unspecified"


def collect_group_values(person: Dict[str, Any], cached_profile: Optional[Dict[str, Any]] = None) -> List[str]:
    cached = cached_profile or {}
    values: List[str] = []
    candidates = [
        cached.get("group"),
        person.get("rosterGroupName"),
        person.get("rosterGroup"),
        person.get("group"),
        person.get("category"),
        person.get("sourceCategory"),
        nested_value(person, "sourceIdentity", "rosterGroupName"),
        nested_value(person, "sourceIdentity", "rosterGroup"),
        nested_value(person, "campaignImport", "rosterGroupName"),
        nested_value(person, "campaignImport", "rosterGroup"),
    ]
    for candidate in candidates:
        if has_content(candidate):
            values.append(str(candidate).strip())

    for collection_key in ("rosterGroups", "groups", "memberships", "rosterMemberships"):
        for item in as_list(person.get(collection_key)):
            if isinstance(item, str) and has_content(item):
                values.append(item.strip())
            elif isinstance(item, dict):
                for key in ("name", "group", "groupName", "category", "label"):
                    if has_content(item.get(key)):
                        values.append(str(item[key]).strip())
                        break

    deduped: List[str] = []
    seen = set()
    for value in values:
        key = slugify(value)
        if key and key not in seen:
            seen.add(key)
            deduped.append(value)
    return deduped


def group_matches(person: Dict[str, Any], cached_profile: Dict[str, Any], requested_group: str) -> bool:
    requested = slugify(requested_group)
    if not requested:
        return True
    values = collect_group_values(person, cached_profile)
    return any(slugify(value) == requested or requested in slugify(value) for value in values)


def latest_runs(profile_id: str) -> List[Dict[str, Any]]:
    return db.get_latest_runs_by_profile(profile_id)


def coverage_for(profile_id: str, person: Dict[str, Any], runs: List[Dict[str, Any]]) -> Dict[str, Any]:
    return source_coverage_client.build_profile_coverage(profile_id, person, runs)


def hydration_for(profile_id: str, person: Dict[str, Any], runs: List[Dict[str, Any]], coverage: Dict[str, Any]) -> Dict[str, Any]:
    return hydration_audit_client.build_profile_hydration_audit(
        profile_id=profile_id,
        person=person,
        latest_runs=runs,
        coverage=coverage,
    )


def latest_run_by_module(runs: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    indexed: Dict[str, Dict[str, Any]] = {}
    for run in runs:
        module_name = first_value(run.get("module_name"), run.get("moduleName"))
        if module_name:
            indexed[module_name] = run
    return indexed


def build_profile_state(cached_profile: Dict[str, Any]) -> Dict[str, Any]:
    profile_id = str(cached_profile.get("profile_id") or "").strip()
    person = get_person(cached_profile)
    runs = latest_runs(profile_id)
    coverage = coverage_for(profile_id, person, runs)
    hydration = hydration_for(profile_id, person, runs, coverage)
    readiness = readiness_client.build_profile_readiness(profile_id, person, runs, coverage, hydration)
    canonical = canonical_profile_client.build_canonical_profile(profile_id, person, runs)
    return {
        "profile_id": profile_id,
        "display_name": cached_profile.get("display_name"),
        "group": get_profile_group(person, cached_profile),
        "person": person,
        "latest_runs": runs,
        "coverage": coverage,
        "hydration": hydration,
        "readiness": readiness,
        "canonical": canonical,
    }


def summarize_global_state(cached_profiles: List[Dict[str, Any]]) -> Dict[str, Any]:
    hydration = hydration_audit_client.build_all_profiles_hydration_audit(
        cached_profiles,
        latest_runs,
        coverage_for,
    )
    readiness = readiness_client.build_all_profiles_readiness(
        cached_profiles,
        latest_runs,
        coverage_for,
        hydration_for,
    )

    canonical_status_counts: Dict[str, int] = {}
    canonical_source_total = 0
    canonical_missing_total = 0
    canonical_needs_review_total = 0

    for cached_profile in cached_profiles:
        profile_id = str(cached_profile.get("profile_id") or "").strip()
        if not profile_id:
            continue
        person = get_person(cached_profile)
        canonical = canonical_profile_client.build_canonical_profile(profile_id, person, latest_runs(profile_id))
        verification = as_dict(canonical.get("verification"))
        status = first_value(verification.get("overall_status"), "unknown")
        canonical_status_counts[status] = canonical_status_counts.get(status, 0) + 1
        canonical_source_total += safe_int(verification.get("source_count"))
        canonical_missing_total += len(as_list(verification.get("missing_core_fields")))
        canonical_needs_review_total += len(as_list(verification.get("needs_review_fields")))

    return {
        "profile_count": len(cached_profiles),
        "hydration": {
            "average_score": hydration.get("average_hydration_score"),
            "aggregate_status_counts": hydration.get("aggregate_status_counts"),
            "weakest_profiles": hydration.get("weakest_profiles"),
        },
        "readiness": {
            "average_score": readiness.get("average_readiness_score"),
            "tier_counts": readiness.get("tier_counts"),
            "lowest_profiles": readiness.get("lowest_profiles"),
        },
        "canonical": {
            "overall_status_counts": canonical_status_counts,
            "average_source_count": round(canonical_source_total / len(cached_profiles), 2) if cached_profiles else 0,
            "missing_core_field_count": canonical_missing_total,
            "needs_review_field_count": canonical_needs_review_total,
        },
    }


def summarize_selected_state(profile_states: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    summaries = []
    for state in profile_states:
        hydration = as_dict(state.get("hydration"))
        readiness = as_dict(state.get("readiness"))
        canonical = as_dict(state.get("canonical"))
        verification = as_dict(canonical.get("verification"))
        summaries.append(
            {
                "profile_id": state.get("profile_id"),
                "display_name": state.get("display_name"),
                "group": state.get("group"),
                "hydration_score": hydration.get("hydration_score"),
                "hydration_focus": hydration.get("recommended_focus"),
                "available_runner_next_actions": hydration.get("available_runner_next_actions", [])[:10],
                "missing_pipe_next_actions": hydration.get("missing_pipe_next_actions", [])[:10],
                "readiness_score": readiness.get("readiness_score"),
                "readiness_tier": readiness.get("readiness_tier"),
                "main_constraint": readiness.get("main_constraint"),
                "canonical_overall_status": verification.get("overall_status"),
                "canonical_missing_core_fields": verification.get("missing_core_fields", []),
                "canonical_needs_review_fields": verification.get("needs_review_fields", []),
            }
        )
    return summaries


def get_category_gaps(hydration: Dict[str, Any], category_name: str) -> List[Dict[str, Any]]:
    return [
        gap
        for gap in as_list(hydration.get("priority_gaps"))
        if isinstance(gap, dict) and gap.get("category") == category_name
    ]


def has_gap_in_categories(hydration: Dict[str, Any], categories: Iterable[str]) -> bool:
    wanted = set(categories)
    for gap in as_list(hydration.get("priority_gaps")):
        if isinstance(gap, dict) and gap.get("category") in wanted:
            return True
    return False


def has_fec_identifier(person: Dict[str, Any]) -> bool:
    ids = openfec_client.get_fec_ids(person)
    return bool(ids.get("candidate_id") or ids.get("committee_id"))


def has_bioguide_id(person: Dict[str, Any]) -> bool:
    return bool(congress_client.get_bioguide_id(person))


def has_openstates_seed(person: Dict[str, Any], hydration: Dict[str, Any]) -> bool:
    profile_type = as_dict(hydration.get("profile_type"))
    return bool(
        openstates_client.get_openstates_person_id(person)
        or profile_type.get("is_state_legislative_profile")
        or source_coverage_client.is_state_legislative_profile(person)
    )


def has_display_name(person: Dict[str, Any]) -> bool:
    return bool(
        first_value(
            person.get("displayName"),
            person.get("name"),
            person.get("fullName"),
            nested_value(person, "sourceIdentity", "displayName"),
        )
    )


def has_official_web_seed(person: Dict[str, Any]) -> bool:
    try:
        candidate_urls = official_web_client.collect_candidate_urls(person)
        public_urls, _skipped = official_web_client.split_public_and_source_urls(candidate_urls)
        return bool(public_urls)
    except Exception:
        return False


def has_youtube_seed(person: Dict[str, Any]) -> bool:
    try:
        identity = youtube_client.get_youtube_identity(person)
        return bool(identity.get("channel_id") or identity.get("channel_url") or identity.get("search_query"))
    except Exception:
        return has_display_name(person)


def latest_run_status(state: Dict[str, Any], runner: str) -> str:
    run = latest_run_by_module(as_list(state.get("latest_runs"))).get(runner)
    return first_value(run.get("run_status"), run.get("runStatus")) if run else ""


def is_completed_latest_run(state: Dict[str, Any], runner: str) -> bool:
    return latest_run_status(state, runner) == "completed"


def runner_is_relevant(state: Dict[str, Any], runner: str) -> Tuple[bool, str, bool]:
    person = as_dict(state.get("person"))
    hydration = as_dict(state.get("hydration"))
    profile_type = as_dict(hydration.get("profile_type"))
    is_federal = bool(profile_type.get("is_federal_profile") or source_coverage_client.is_federal_profile(person))
    has_name = has_display_name(person)

    if runner == "official_web_contact":
        if not has_official_web_seed(person):
            return False, "No public official, campaign, contact, social, or media URLs are present to verify.", False
        relevant = has_gap_in_categories(hydration, ["official_web_contact", "core_identity", "biographical_profile"])
        return relevant, "Official/contact URL or biographical verification gaps remain.", False

    if runner == "openfec_finance":
        if not has_fec_identifier(person):
            return False, "No FEC candidate or committee ID is present.", False
        relevant = has_gap_in_categories(hydration, ["campaign_finance"])
        return relevant, "FEC-backed campaign finance gaps remain.", True

    if runner == "congress_legislation":
        if not has_bioguide_id(person):
            return False, "No Bioguide ID is present.", False
        relevant = has_gap_in_categories(hydration, ["legislative_activity"])
        return relevant, "Congress.gov legislative activity gaps remain.", True

    if runner == "youtube_media":
        if not has_youtube_seed(person):
            return False, "No YouTube channel seed or searchable name is present.", False
        relevant = has_gap_in_categories(hydration, ["media_public_attention"])
        return relevant, "YouTube/media visibility gaps remain.", True

    if runner == "web_mentions":
        if not has_name:
            return False, "No display name is present for public mention searches.", False
        relevant = has_gap_in_categories(hydration, ["media_public_attention"])
        return relevant, "Public mentions and media attention gaps remain.", False

    if runner == "openstates_legislation":
        if not has_openstates_seed(person, hydration):
            return False, "No OpenStates ID or state legislative profile signal is present.", False
        relevant = has_gap_in_categories(hydration, ["legislative_activity"])
        return relevant, "OpenStates/state legislative activity gaps remain.", True

    if runner == "race_opponent_context":
        if not has_name:
            return False, "No display name is present for race context.", False
        relevant = has_gap_in_categories(hydration, ["race_context", "opposition_intelligence"])
        requires_key = is_federal
        return relevant, "Race context or source-backed opponent discovery gaps remain.", requires_key

    return False, "Unknown runner.", False


def canonical_manual_gaps(state: Dict[str, Any]) -> List[Dict[str, Any]]:
    canonical = as_dict(state.get("canonical"))
    verification = as_dict(canonical.get("verification"))
    fields = as_list(verification.get("missing_core_fields")) + as_list(verification.get("needs_review_fields"))
    gaps = []
    manual_markers = {
        "headshot": "approved_internal_headshot",
        "headshots": "approved_internal_headshot",
        "bio": "approved_md_bio",
        "biography": "approved_md_bio",
        "socials": "approved_social_handles",
        "brand_assets": "approved_brand_asset_source",
        "brand": "approved_brand_asset_source",
    }
    for field in fields:
        field_text = str(field or "")
        field_lower = field_text.lower()
        manual_type = ""
        for marker, gap_type in manual_markers.items():
            if marker in field_lower:
                manual_type = gap_type
                break
        if manual_type:
            gaps.append(
                {
                    "profile_id": state.get("profile_id"),
                    "display_name": state.get("display_name"),
                    "gap": field_text,
                    "manual_or_internal": manual_type,
                    "reason": "Canonical verification requires approved internal/provenance-backed material; the orchestrator will not fabricate it.",
                }
            )
    return gaps


def collect_gap_inventory(profile_states: List[Dict[str, Any]]) -> Dict[str, Any]:
    fillable_remaining = []
    existing_pipe_exhausted = []
    missing_pipe_gaps = []
    manual_or_internal_gaps = []

    for state in profile_states:
        hydration = as_dict(state.get("hydration"))
        for gap in as_list(hydration.get("available_runner_next_actions")):
            if not isinstance(gap, dict):
                continue
            recommended = normalize_runner_name(gap.get("recommended_next_runner"))
            item = {
                "profile_id": state.get("profile_id"),
                "display_name": state.get("display_name"),
                "group": state.get("group"),
                "gap": gap,
                "runner": recommended,
                "latest_run_status": latest_run_status(state, recommended) if recommended else "",
            }
            if recommended and is_completed_latest_run(state, recommended):
                existing_pipe_exhausted.append(item)
            else:
                fillable_remaining.append(item)

        for gap in as_list(hydration.get("missing_pipe_next_actions")):
            if isinstance(gap, dict):
                missing_pipe_gaps.append(
                    {
                        "profile_id": state.get("profile_id"),
                        "display_name": state.get("display_name"),
                        "group": state.get("group"),
                        "gap": gap,
                    }
                )

        manual_or_internal_gaps.extend(canonical_manual_gaps(state))

    return {
        "fillable_remaining_gaps": fillable_remaining[:200],
        "existing_pipe_exhausted_gaps": existing_pipe_exhausted[:200],
        "missing_pipe_gaps": missing_pipe_gaps[:200],
        "manual_or_internal_gaps": manual_or_internal_gaps[:200],
        "counts": {
            "fillable_remaining_gaps": len(fillable_remaining),
            "existing_pipe_exhausted_gaps": len(existing_pipe_exhausted),
            "missing_pipe_gaps": len(missing_pipe_gaps),
            "manual_or_internal_gaps": len(manual_or_internal_gaps),
        },
    }


def normalize_runner_name(value: Any) -> str:
    key = str(value or "").strip()
    if not key:
        return ""
    normalized = key.lower().replace(" ", "_")
    return RUNNER_ALIASES.get(normalized, RUNNER_ALIASES.get(slugify(key), key if key in RUNNERS else ""))


def parse_runners(raw_runners: List[str]) -> List[str]:
    if not raw_runners:
        return RUNNERS[:]
    parsed: List[str] = []
    for raw in raw_runners:
        runner = normalize_runner_name(raw)
        if runner not in RUNNERS:
            raise SystemExit(f"Unknown runner '{raw}'. Supported runners: {', '.join(RUNNERS)}")
        if runner not in parsed:
            parsed.append(runner)
    return parsed


def sort_profiles_for_hydration(profile_states: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        profile_states,
        key=lambda state: (
            safe_int(as_dict(state.get("hydration")).get("hydration_score"), 999),
            str(state.get("display_name") or "").lower(),
            str(state.get("profile_id") or "").lower(),
        ),
    )


def build_plan(
    profile_states: List[Dict[str, Any]],
    requested_runners: List[str],
    explicit_runner: bool,
    resume_state: Dict[str, Any],
    resume: bool,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    plan: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    completed_records = as_dict(resume_state.get("completed_run_keys"))

    for state in profile_states:
        for runner in requested_runners:
            applicable, reason, requires_key = runner_is_relevant(state, runner)
            key = f"{state.get('profile_id')}|{runner}"

            if resume and completed_records.get(key):
                skipped.append(
                    {
                        "profile_id": state.get("profile_id"),
                        "display_name": state.get("display_name"),
                        "runner": runner,
                        "reason": "Skipped by --resume because this profile/runner completed in orchestration state.",
                    }
                )
                continue

            if not applicable and not explicit_runner:
                skipped.append(
                    {
                        "profile_id": state.get("profile_id"),
                        "display_name": state.get("display_name"),
                        "runner": runner,
                        "reason": reason,
                    }
                )
                continue

            if is_completed_latest_run(state, runner) and not explicit_runner:
                skipped.append(
                    {
                        "profile_id": state.get("profile_id"),
                        "display_name": state.get("display_name"),
                        "runner": runner,
                        "reason": "Latest run already completed; remaining gaps are reported as exhausted by this existing pipe.",
                    }
                )
                continue

            env_key = RUNNER_ENV_KEYS.get(runner)
            if runner == "race_opponent_context" and requires_key:
                env_key = "FEC_API_KEY"

            plan.append(
                {
                    "profile_id": state.get("profile_id"),
                    "display_name": state.get("display_name"),
                    "group": state.get("group"),
                    "runner": runner,
                    "runner_label": RUNNER_LABELS.get(runner, runner),
                    "reason": reason if applicable else f"Explicit runner requested; {reason}",
                    "latest_run_status": latest_run_status(state, runner),
                    "requires_api_key": env_key or "",
                    "api_key_configured": bool(os.environ.get(env_key or "", "").strip()) if env_key else True,
                    "resume_key": key,
                }
            )
    return plan, skipped


def build_runner_payload(runner: str, profile_id: str, person: Dict[str, Any], args: argparse.Namespace) -> Dict[str, Any]:
    if runner == "official_web_contact":
        return official_web_client.build_official_web_contact_run_payload(
            profile_id=profile_id,
            person=person,
            timeout_seconds=args.timeout_seconds,
        )
    if runner == "openfec_finance":
        return openfec_client.build_openfec_finance_run_payload(
            profile_id=profile_id,
            person=person,
            api_key=os.environ.get("FEC_API_KEY", "").strip(),
            cycle=args.cycle,
        )
    if runner == "congress_legislation":
        return congress_client.build_congress_legislation_run_payload(
            profile_id=profile_id,
            person=person,
            api_key=os.environ.get("CONGRESS_API_KEY", "").strip(),
            congress=args.congress,
            limit=args.runner_limit,
        )
    if runner == "youtube_media":
        return youtube_client.build_youtube_media_run_payload(
            profile_id=profile_id,
            person=person,
            api_key=os.environ.get("YOUTUBE_API_KEY", "").strip(),
            max_results=args.youtube_max_results,
        )
    if runner == "web_mentions":
        return web_mentions_client.build_web_mentions_run_payload(
            profile_id=profile_id,
            person=person,
            max_results=args.web_mentions_max_results,
            max_feeds=args.web_mentions_max_feeds,
        )
    if runner == "openstates_legislation":
        return openstates_client.build_openstates_legislation_run_payload(
            profile_id=profile_id,
            person=person,
            api_key=os.environ.get("OPENSTATES_API_KEY", "").strip(),
            bill_limit=args.runner_limit,
            vote_limit=args.runner_limit,
            committee_limit=args.runner_limit,
        )
    if runner == "race_opponent_context":
        return race_context_client.build_race_opponent_context_run_payload(
            profile_id=profile_id,
            person=person,
            api_key=os.environ.get("FEC_API_KEY", "").strip(),
            cycle=args.cycle,
            candidate_limit=args.race_candidate_limit,
        )
    raise ValueError(f"Unsupported runner: {runner}")


def read_state() -> Dict[str, Any]:
    if not STATE_PATH.exists():
        return {"completed_run_keys": {}, "attempted_run_keys": {}}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"completed_run_keys": {}, "attempted_run_keys": {}, "state_read_warning": "State file was invalid JSON."}


def write_state(state: Dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def execute_plan(
    plan: List[Dict[str, Any]],
    profile_state_by_id: Dict[str, Dict[str, Any]],
    args: argparse.Namespace,
    resume_state: Dict[str, Any],
) -> List[Dict[str, Any]]:
    results = []
    attempted = as_dict(resume_state.setdefault("attempted_run_keys", {}))
    completed = as_dict(resume_state.setdefault("completed_run_keys", {}))

    for index, item in enumerate(plan, start=1):
        profile_id = str(item.get("profile_id") or "").strip()
        runner = str(item.get("runner") or "").strip()
        key = str(item.get("resume_key") or f"{profile_id}|{runner}")
        state = profile_state_by_id.get(profile_id, {})
        person = as_dict(state.get("person"))
        started_at = utc_now_iso()

        env_key = str(item.get("requires_api_key") or "")
        if env_key and not os.environ.get(env_key, "").strip():
            outcome = {
                **item,
                "orchestration_status": "skipped_missing_api_key",
                "error": f"{env_key} is not configured.",
                "started_at": started_at,
                "completed_at": utc_now_iso(),
            }
            results.append(outcome)
            attempted[key] = outcome
            write_state(resume_state)
            continue

        try:
            payload = build_runner_payload(runner, profile_id, person, args)
            saved = db.save_intelligence_run(payload)
            outcome = {
                **item,
                "orchestration_status": "saved",
                "run_id": saved.get("run_id"),
                "run_status": saved.get("run_status"),
                "source_name": saved.get("source_name"),
                "source_url": saved.get("source_url"),
                "started_at": started_at,
                "completed_at": utc_now_iso(),
            }
            completed[key] = outcome
            attempted[key] = outcome
            results.append(outcome)
        except Exception as error:
            outcome = {
                **item,
                "orchestration_status": "failed",
                "error": str(error),
                "traceback_tail": traceback.format_exc(limit=2),
                "started_at": started_at,
                "completed_at": utc_now_iso(),
            }
            attempted[key] = outcome
            results.append(outcome)

        write_state(resume_state)

        if args.sleep_seconds > 0 and index < len(plan):
            time.sleep(args.sleep_seconds)

    return results


def count_by(items: Iterable[Dict[str, Any]], key: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in items:
        value = str(item.get(key) or "unspecified")
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))


def select_profiles(cached_profiles: List[Dict[str, Any]], args: argparse.Namespace) -> Tuple[List[Dict[str, Any]], List[str]]:
    warnings: List[str] = []
    selected = cached_profiles

    if args.profile:
        requested = set(args.profile)
        selected = [profile for profile in selected if str(profile.get("profile_id")) in requested]
        found = {str(profile.get("profile_id")) for profile in selected}
        missing = sorted(requested - found)
        if missing:
            warnings.append(f"Requested profile IDs not found: {', '.join(missing)}")

    if args.group:
        selected = [
            profile
            for profile in selected
            if group_matches(get_person(profile), profile, args.group)
        ]
        if not selected:
            warnings.append(f"No profiles matched group '{args.group}'.")

    all_states = [build_profile_state(profile) for profile in selected]
    sorted_states = sort_profiles_for_hydration(all_states)
    sorted_profile_ids = [str(state.get("profile_id")) for state in sorted_states]
    ordered_profiles = sorted(
        selected,
        key=lambda profile: sorted_profile_ids.index(str(profile.get("profile_id")))
        if str(profile.get("profile_id")) in sorted_profile_ids
        else 999999,
    )

    if not args.all:
        limit = args.limit if args.limit is not None else 10
        ordered_profiles = ordered_profiles[: max(0, limit)]

    return ordered_profiles, warnings


def write_report(report: Dict[str, Any]) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"hydration_orchestration_report_{timestamp_for_filename()}.json"
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def print_console_report(report: Dict[str, Any], report_path: Path) -> None:
    mode = report.get("mode")
    selection = as_dict(report.get("selection"))
    plan = as_list(report.get("run_plan"))
    apply_results = as_list(report.get("apply_results"))
    before = as_dict(report.get("before"))
    after = as_dict(report.get("after"))
    gaps = as_dict(report.get("gap_inventory"))

    print("")
    print("Hydration Orchestration Report")
    print("==============================")
    print(f"Mode: {mode}")
    print(f"Profiles available: {selection.get('profiles_available')}")
    print(f"Profiles selected: {selection.get('profiles_selected')}")
    print(f"Default limit applied: {selection.get('default_limit_applied')}")
    print(f"Report written: {report_path}")
    print("")

    group_counts = as_dict(selection.get("selected_group_counts"))
    if group_counts:
        print("Selected group counts:")
        for group, count in group_counts.items():
            print(f"  - {group}: {count}")
        print("")

    hydration = as_dict(before.get("hydration"))
    readiness = as_dict(before.get("readiness"))
    canonical = as_dict(before.get("canonical"))
    print("Before:")
    print(f"  Hydration average: {hydration.get('average_score')}")
    print(f"  Readiness average: {readiness.get('average_score')}")
    print(f"  Canonical status counts: {canonical.get('overall_status_counts')}")
    print("")

    print("Planned runner executions:")
    print(f"  Total: {len(plan)}")
    for runner, count in count_by(plan, "runner").items():
        print(f"  - {runner}: {count}")
    print("")

    gap_counts = as_dict(gaps.get("counts"))
    if gap_counts:
        print("Gap inventory for selected profiles:")
        for key, count in gap_counts.items():
            print(f"  - {key}: {count}")
        print("")

    if apply_results:
        print("Apply results:")
        for status, count in count_by(apply_results, "orchestration_status").items():
            print(f"  - {status}: {count}")
        if after:
            after_hydration = as_dict(after.get("hydration"))
            after_readiness = as_dict(after.get("readiness"))
            print(f"  Hydration average after: {after_hydration.get('average_score')}")
            print(f"  Readiness average after: {after_readiness.get('average_score')}")
        print("")

    warnings = as_list(report.get("warnings"))
    if warnings:
        print("Warnings:")
        for warning in warnings:
            print(f"  - {warning}")
        print("")

    skipped = as_list(report.get("skipped_plan_items"))
    if skipped:
        print(f"Skipped/non-applicable items: {len(skipped)}")
        for item in skipped[:10]:
            print(f"  - {item.get('profile_id')} {item.get('runner')}: {item.get('reason')}")
        if len(skipped) > 10:
            print(f"  - ... {len(skipped) - 10} more")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Plan or run existing hydration runners for cached Member Command Center profiles.")
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument("--dry-run", action="store_true", help="Plan and report without changing the database.")
    mode_group.add_argument("--apply", action="store_true", help="Execute planned runner calls and save intelligence runs.")
    mode_group.add_argument("--report-only", action="store_true", help="Summarize current hydration/readiness/canonical gaps without running runners.")
    parser.add_argument("--profile", action="append", help="Limit to a profile_id. Repeat for multiple profiles.")
    parser.add_argument("--group", help="Limit to a roster group/category name or slug.")
    parser.add_argument("--runner", action="append", help="Limit to a runner name. Repeat for multiple runners.")
    parser.add_argument("--limit", type=int, help="Limit selected profiles. Defaults to 10 unless --all is set.")
    parser.add_argument("--all", action="store_true", help="Select all matching profiles instead of the conservative default limit.")
    parser.add_argument("--sleep-seconds", type=float, default=0.0, help="Delay between runner executions in apply mode.")
    parser.add_argument("--timeout-seconds", type=int, default=10, help="Timeout for runners that support per-request timeout.")
    parser.add_argument("--resume", action="store_true", help="Skip profile/runner pairs completed in the orchestration state file.")
    parser.add_argument("--cycle", default="2026", help="Election cycle for FEC-backed runners.")
    parser.add_argument("--congress", default="119", help="Congress number for Congress.gov runner.")
    parser.add_argument("--runner-limit", type=int, default=10, help="Per-runner API result limit for legislation runners.")
    parser.add_argument("--youtube-max-results", type=int, default=5, help="YouTube max results per profile.")
    parser.add_argument("--web-mentions-max-results", type=int, default=20, help="Web mentions max results per profile.")
    parser.add_argument("--web-mentions-max-feeds", type=int, default=3, help="Web mentions max RSS feeds per profile.")
    parser.add_argument("--race-candidate-limit", type=int, default=50, help="Race/opponent FEC candidate limit.")
    return parser


def main() -> int:
    args = build_arg_parser().parse_args()
    mode = "apply" if args.apply else "report-only" if args.report_only else "dry-run"

    env_report = load_environment()
    cached_profiles, profile_source = load_cached_profiles(allow_initialize=args.apply)
    warnings: List[str] = []
    if not args.all and args.limit is None:
        warnings.append("Conservative default applied: limiting selection to 10 profiles because --all was not provided.")

    selected_profiles, selection_warnings = select_profiles(cached_profiles, args)
    warnings.extend(selection_warnings)
    selected_states = [build_profile_state(profile) for profile in selected_profiles]
    selected_state_by_id = {str(state.get("profile_id")): state for state in selected_states}
    requested_runners = parse_runners(args.runner or [])
    explicit_runner = bool(args.runner)
    resume_state = read_state() if args.resume or args.apply else {"completed_run_keys": {}, "attempted_run_keys": {}}
    plan, skipped = build_plan(selected_states, requested_runners, explicit_runner, resume_state, args.resume)

    before = summarize_global_state(cached_profiles)
    gap_inventory = collect_gap_inventory(selected_states)
    apply_results: List[Dict[str, Any]] = []
    after: Optional[Dict[str, Any]] = None

    if mode == "apply":
        apply_results = execute_plan(plan, selected_state_by_id, args, resume_state)
        refreshed_profiles, _source = load_cached_profiles(allow_initialize=True)
        after = summarize_global_state(refreshed_profiles)
    elif mode == "report-only":
        plan = []
        skipped = []

    selected_group_counts: Dict[str, int] = {}
    for state in selected_states:
        group = str(state.get("group") or "Unspecified")
        selected_group_counts[group] = selected_group_counts.get(group, 0) + 1

    report: Dict[str, Any] = {
        "generated_at": utc_now_iso(),
        "mode": mode,
        "profile_source": profile_source,
        "environment": env_report,
        "selection": {
            "profiles_available": len(cached_profiles),
            "profiles_selected": len(selected_profiles),
            "profile_filter": args.profile or [],
            "group_filter": args.group or "",
            "runner_filter": args.runner or [],
            "limit": args.limit,
            "all": args.all,
            "default_limit_applied": (not args.all and args.limit is None),
            "selected_profile_ids": [profile.get("profile_id") for profile in selected_profiles],
            "selected_group_counts": dict(sorted(selected_group_counts.items())),
        },
        "before": before,
        "selected_profile_state_before": summarize_selected_state(selected_states),
        "gap_inventory": gap_inventory,
        "run_plan": plan,
        "skipped_plan_items": skipped,
        "apply_results": apply_results,
        "after": after,
        "warnings": warnings,
        "state_file": str(STATE_PATH),
        "notes": [
            "Dry-run and report-only modes do not execute runners or save intelligence runs.",
            "Apply mode saves only existing runner payloads through db.save_intelligence_run.",
            "Manual/internal asset gaps are reported only and are never marked verified by this script.",
            "Opponent identity, prior results, and race scaffolds are not treated as polling or contrast intelligence.",
        ],
    }

    report_path = write_report(report)
    print_console_report(report, report_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
