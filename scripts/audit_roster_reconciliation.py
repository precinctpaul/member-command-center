import argparse
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = PROJECT_ROOT / "server"
DATA_DIR = PROJECT_ROOT / "data"
PEOPLE_PATH = DATA_DIR / "people.json"
DEFAULT_CAMPAIGN_ROOT = Path(r"C:\dev\campaign-command-center")

sys.path.insert(0, str(SERVER_DIR))

import db  # noqa: E402
import hydration_audit_client  # noqa: E402
import readiness_client  # noqa: E402
import source_coverage_client  # noqa: E402


EXPECTED_GROUPS = {
    "Majority Democrats",
    "The Bench",
    "Cabinet/Others",
    "Other / Executive / Opposition",
}

PLACEHOLDER_VALUES = {
    "",
    "--",
    "-",
    "n/a",
    "na",
    "none",
    "null",
    "unknown",
    "not available",
    "source needed",
    "source required",
    "missing_source",
    "source_needed",
    "not_loaded",
    "not started",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")


def has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        text = value.strip()
        return bool(text) and text.lower() not in PLACEHOLDER_VALUES
    if isinstance(value, list):
        return any(has_value(item) for item in value)
    if isinstance(value, dict):
        return any(has_value(item) for item in value.values())
    return True


def first_value(*values: Any) -> str:
    for value in values:
        if has_value(value):
            return str(value).strip()
    return ""


def as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def nested_value(source: Dict[str, Any], *path: str) -> Any:
    current: Any = source
    for key in path:
        if not isinstance(current, dict):
            return ""
        current = current.get(key)
    return current if current is not None else ""


def normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def slugify(value: Any) -> str:
    text = normalize_text(value).replace(" ", "-")
    return text or "profile"


def profile_id(profile: Dict[str, Any], index: int) -> str:
    return str(db.normalize_person_for_cache(profile, index).get("profile_id") or "").strip()


def display_name(profile: Dict[str, Any]) -> str:
    return first_value(
        profile.get("displayName"),
        profile.get("name"),
        profile.get("fullName"),
        nested_value(profile, "identity", "fullName"),
        nested_value(profile, "sourceIdentity", "displayName"),
    )


def group_values(profile: Dict[str, Any]) -> List[str]:
    values: List[str] = []
    for key in ["rosterGroupName", "category", "group"]:
        value = first_value(profile.get(key))
        if value:
            values.append(value)
    for value in as_list(profile.get("rosterGroups")):
        text = first_value(value)
        if text:
            values.append(text)
    return values


def primary_group(profile: Dict[str, Any]) -> str:
    return first_value(
        profile.get("rosterGroupName"),
        profile.get("category"),
        profile.get("group"),
        *as_list(profile.get("rosterGroups")),
    )


def office_title(profile: Dict[str, Any]) -> str:
    return first_value(
        profile.get("title"),
        profile.get("officeTitle"),
        profile.get("currentOffice"),
        profile.get("officeType"),
        profile.get("role"),
        nested_value(profile, "office", "title"),
        nested_value(profile, "sourceIdentity", "title"),
    )


def jurisdiction(profile: Dict[str, Any]) -> str:
    return first_value(
        profile.get("state"),
        profile.get("stateCode"),
        profile.get("jurisdiction"),
        nested_value(profile, "politicalGeography", "state"),
        nested_value(profile, "office", "state"),
        nested_value(profile, "sourceIdentity", "state"),
    )


def source_node_ids(profile: Dict[str, Any]) -> Dict[str, Any]:
    campaign_import = as_dict(profile.get("campaignImport"))
    source_identity = as_dict(profile.get("sourceIdentity"))
    return {
        "sourceNodeId": first_value(profile.get("sourceNodeId")),
        "campaignImport.nodeId": first_value(campaign_import.get("nodeId")),
        "campaignImport.matchedCampaignNodeIds": [
            str(value).strip()
            for value in as_list(campaign_import.get("matchedCampaignNodeIds"))
            if has_value(value)
        ],
        "sourceIdentity.campaignCommandCenterNodeId": first_value(
            source_identity.get("campaignCommandCenterNodeId")
        ),
    }


def all_campaign_node_ids(profile: Dict[str, Any]) -> List[str]:
    node_fields = source_node_ids(profile)
    values = [
        node_fields["sourceNodeId"],
        node_fields["campaignImport.nodeId"],
        node_fields["sourceIdentity.campaignCommandCenterNodeId"],
        *node_fields["campaignImport.matchedCampaignNodeIds"],
    ]
    output: List[str] = []
    for value in values:
        text = str(value or "").strip()
        if text and text not in output:
            output.append(text)
    return output


def find_duplicates(
    profiles: List[Dict[str, Any]],
    ids_by_index: List[str],
    label: str,
    extractor,
    normalizer=lambda value: str(value or "").strip(),
) -> List[Dict[str, Any]]:
    buckets: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    for index, profile in enumerate(profiles):
        raw_values = extractor(profile)
        if not isinstance(raw_values, list):
            raw_values = [raw_values]
        for raw_value in raw_values:
            value = normalizer(raw_value)
            if not value:
                continue
            buckets[value].append(
                {
                    "profile_id": ids_by_index[index],
                    "display_name": display_name(profile),
                }
            )
    return [
        {"field": label, "value": value, "profiles": rows}
        for value, rows in sorted(buckets.items())
        if len(rows) > 1
    ]


def count_source_fields(profile: Dict[str, Any]) -> Dict[str, bool]:
    official_links = as_dict(profile.get("officialLinks"))
    source_identity = as_dict(profile.get("sourceIdentity"))
    finance = as_dict(profile.get("campaignFinanceSnapshot"))
    race = as_dict(profile.get("raceContext"))
    legislative = as_dict(profile.get("legislativeMechanics"))
    headshot = as_dict(profile.get("headshot"))
    bio = profile.get("bio")
    bio_text = first_value(
        profile.get("shortBio"),
        profile.get("biography"),
        profile.get("bio") if isinstance(bio, str) else "",
        nested_value(profile, "bio", "oneLine"),
        nested_value(profile, "bio", "short"),
        nested_value(profile, "bio", "standard"),
        nested_value(profile, "profile", "bio"),
    )

    return {
        "official_website": bool(first_value(official_links.get("officialWebsite"), profile.get("officialWebsite"))),
        "campaign_website": bool(first_value(official_links.get("campaignWebsite"), profile.get("campaignWebsite"))),
        "headshot": bool(first_value(headshot.get("primaryUrl"), profile.get("headshotUrl"), profile.get("photoUrl"), profile.get("image"))),
        "bio": bool(bio_text),
        "congress_bioguide": bool(
            first_value(
                source_identity.get("bioguideId"),
                profile.get("bioguideId"),
                legislative.get("bioguideId"),
                official_links.get("congressGovProfile"),
                legislative.get("congressGovUrl"),
            )
        ),
        "openstates": bool(
            first_value(
                source_identity.get("openStatesPersonId"),
                source_identity.get("openStatesUrl"),
                legislative.get("openStatesPersonId"),
                legislative.get("openStatesUrl"),
                official_links.get("openStatesProfile"),
            )
        ),
        "fec_openfec": bool(
            first_value(
                source_identity.get("fecCandidateId"),
                source_identity.get("fecPrincipalCommitteeId"),
                finance.get("fecCandidateId"),
                finance.get("fecPrincipalCommitteeId"),
                finance.get("sourceUrl"),
            )
        ),
        "voting_source": bool(first_value(legislative.get("votingRecordSourceUrl"), legislative.get("votingRecordSource"))),
        "legislative_source": bool(
            first_value(
                legislative.get("congressGovUrl"),
                legislative.get("openStatesUrl"),
                legislative.get("sponsoredLegislationEndpoint"),
                legislative.get("cosponsoredLegislationEndpoint"),
                official_links.get("congressGovProfile"),
                official_links.get("openStatesProfile"),
            )
        ),
        "election_context": bool(
            first_value(
                race.get("sourceUrl"),
                race.get("electionSourceUrl"),
                race.get("electionRulesSource"),
                race.get("electionCycle"),
            )
        ),
    }


def get_hydration_field(audit: Dict[str, Any], category_key: str, field_key: str) -> Dict[str, Any]:
    for category in as_list(audit.get("categories")):
        if category.get("category") != category_key:
            continue
        for field in as_list(category.get("fields")):
            if field.get("field") == field_key:
                return field
    return {}


def get_readiness_framework(readiness: Dict[str, Any], key: str) -> Dict[str, Any]:
    for framework in as_list(readiness.get("framework_statuses")):
        if framework.get("key") == key:
            return framework
    return {}


def short_profile(profile: Dict[str, Any], profile_id_value: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = {
        "profile_id": profile_id_value,
        "display_name": display_name(profile),
        "group": primary_group(profile),
    }
    if extra:
        payload.update(extra)
    return payload


def inspect_campaign_root(campaign_root: Path, represented_node_ids: Iterable[str]) -> Dict[str, Any]:
    represented = {str(value).strip().upper() for value in represented_node_ids if str(value).strip()}
    source_map_path = campaign_root / "person_source_map.json"
    memory_path = campaign_root / "campaign_memory_store.json"
    db_path = campaign_root / "govintel_dev.db"

    source_map = read_json(source_map_path, {})
    source_ids = {
        str(node_id).strip().upper()
        for node_id in source_map.keys()
        if str(node_id).strip()
    } if isinstance(source_map, dict) else set()

    memory = read_json(memory_path, {})
    memory_ids = set()
    memory_counts = {}
    if isinstance(memory, dict):
        for collection in ["coreOps", "frontline", "executive"]:
            rows = memory.get(collection)
            memory_counts[collection] = len(rows) if isinstance(rows, list) else 0
            if isinstance(rows, list):
                for row in rows:
                    if isinstance(row, dict):
                        node_id = first_value(row.get("nodeId"), row.get("candidateId"))
                        if node_id:
                            memory_ids.add(node_id.upper())

    database: Dict[str, Any] = {"exists": db_path.exists()}
    if db_path.exists():
        try:
            connection = sqlite3.connect(db_path)
            connection.row_factory = sqlite3.Row
            tables = [
                row["name"]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
                ).fetchall()
            ]
            database["tables"] = tables
            if "tracked_people" in tables:
                database["tracked_people_count"] = connection.execute(
                    "SELECT COUNT(*) AS count FROM tracked_people"
                ).fetchone()["count"]
            if "person_roster_memberships" in tables:
                database["person_roster_memberships_count"] = connection.execute(
                    "SELECT COUNT(*) AS count FROM person_roster_memberships"
                ).fetchone()["count"]
            connection.close()
        except Exception as error:  # pragma: no cover - diagnostic only
            database["error"] = str(error)

    return {
        "campaign_root": str(campaign_root),
        "person_source_map": {
            "path": str(source_map_path),
            "exists": source_map_path.exists(),
            "entry_count": len(source_ids),
            "represented_count": len(source_ids & represented) if source_ids else 0,
            "missing_from_member": sorted(source_ids - represented),
            "extra_member_node_ids": sorted(represented - source_ids) if source_ids else [],
        },
        "campaign_memory_store": {
            "path": str(memory_path),
            "exists": memory_path.exists(),
            "collection_counts": memory_counts,
            "unique_node_count": len(memory_ids),
            "represented_count": len(memory_ids & represented) if memory_ids else 0,
            "missing_from_member": sorted(memory_ids - represented),
        },
        "database": database,
    }


def build_scoring_audit(profiles: List[Dict[str, Any]], ids_by_index: List[str]) -> Dict[str, Any]:
    artificial_low: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    artificial_high: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    readiness_scores = []
    hydration_scores = []

    for index, profile in enumerate(profiles):
        pid = ids_by_index[index]
        latest_runs = db.get_latest_runs_by_profile(profile_id=pid)
        coverage = source_coverage_client.build_profile_coverage(pid, profile, latest_runs)
        hydration = hydration_audit_client.build_profile_hydration_audit(pid, profile, latest_runs, coverage)
        readiness = readiness_client.build_profile_readiness(pid, profile, latest_runs, coverage, hydration)
        source_fields = count_source_fields(profile)

        readiness_scores.append(readiness.get("readiness_score", 0))
        hydration_scores.append(hydration.get("hydration_score", 0))

        official_field = get_hydration_field(hydration, "official_web_contact", "official_website")
        if source_fields["official_website"] and official_field.get("status") != "populated":
            artificial_low["hydration_official_website_imported_but_runner_only"].append(
                short_profile(profile, pid, {"hydration_status": official_field.get("status")})
            )

        campaign_field = get_hydration_field(hydration, "official_web_contact", "campaign_website")
        if source_fields["campaign_website"] and campaign_field.get("status") != "populated":
            artificial_low["hydration_campaign_website_imported_but_runner_only"].append(
                short_profile(profile, pid, {"hydration_status": campaign_field.get("status")})
            )

        bio_source_field = get_hydration_field(hydration, "biographical_profile", "official_sources")
        if has_value(profile.get("sourceTracking")) and bio_source_field.get("status") != "populated":
            artificial_low["hydration_source_tracking_not_counted_as_official_sources"].append(
                short_profile(profile, pid, {"hydration_status": bio_source_field.get("status")})
            )

        committee_field = get_hydration_field(hydration, "campaign_finance", "committee_id")
        committee_id = first_value(
            nested_value(profile, "sourceIdentity", "fecPrincipalCommitteeId"),
            nested_value(profile, "campaignFinanceSnapshot", "fecPrincipalCommitteeId"),
        )
        if committee_id and committee_field.get("status") != "populated":
            artificial_low["hydration_fec_committee_id_imported_but_summary_only"].append(
                short_profile(profile, pid, {"hydration_status": committee_field.get("status")})
            )

        openstates_field = get_hydration_field(hydration, "legislative_activity", "openstates_identity")
        if source_fields["openstates"] and openstates_field.get("status") != "populated":
            artificial_low["hydration_openstates_identity_imported_but_summary_only"].append(
                short_profile(profile, pid, {"hydration_status": openstates_field.get("status")})
            )

        source_health = get_readiness_framework(readiness, "source_health")
        if not latest_runs and has_value(profile.get("sourceTracking")) and int(source_health.get("score") or 0) >= 45:
            artificial_high["readiness_source_health_partial_from_static_source_tracking"].append(
                short_profile(
                    profile,
                    pid,
                    {"source_health_score": source_health.get("score"), "source_tracking_count": len(as_list(profile.get("sourceTracking")))},
                )
            )

        election = get_readiness_framework(readiness, "election_context")
        race_context = as_dict(profile.get("raceContext"))
        if (
            election.get("status") == "complete"
            and not first_value(race_context.get("sourceUrl"), race_context.get("electionSourceUrl"))
            and first_value(race_context.get("electionRulesSource"))
        ):
            artificial_high["readiness_election_context_complete_without_source_url"].append(
                short_profile(profile, pid, {"election_score": election.get("score")})
            )

        legislative = get_readiness_framework(readiness, "legislative_activity")
        legislative_mechanics = as_dict(profile.get("legislativeMechanics"))
        zero_activity_values = [
            legislative_mechanics.get("sponsoredLegislationCount"),
            legislative_mechanics.get("cosponsoredLegislationCount"),
        ]
        if (
            int(legislative.get("score") or 0) >= 55
            and not latest_runs
            and any(str(value).strip() == "0" for value in zero_activity_values if value is not None)
        ):
            artificial_high["readiness_legislative_activity_may_count_zero_values"].append(
                short_profile(profile, pid, {"legislative_score": legislative.get("score")})
            )

        headshot_field = get_hydration_field(hydration, "core_identity", "headshot")
        if (
            headshot_field.get("status") == "populated"
            and has_value(profile.get("headshot"))
            and not source_fields["headshot"]
        ):
            artificial_high["hydration_headshot_dict_counted_without_primary_url"].append(
                short_profile(profile, pid)
            )

    return {
        "average_readiness_score": round(sum(readiness_scores) / len(readiness_scores)) if readiness_scores else 0,
        "average_hydration_score": round(sum(hydration_scores) / len(hydration_scores)) if hydration_scores else 0,
        "artificial_low_risk": {key: rows for key, rows in sorted(artificial_low.items())},
        "artificial_high_risk": {key: rows for key, rows in sorted(artificial_high.items())},
        "notes": [
            "Readiness generally recognizes imported officialLinks, sourceTracking, FEC, Bioguide, OpenStates, raceContext, and legislativeMechanics fields.",
            "Hydration still relies heavily on saved runner summaries for official web, campaign web, committee ID, and OpenStates identity fields, so static imported source fields can look under-hydrated until runners execute.",
            "Source health can receive partial readiness from static sourceTracking even when no source runner has executed; this is a review item, not a data duplicate.",
        ],
    }


def build_report(campaign_root: Path) -> Dict[str, Any]:
    people = read_json(PEOPLE_PATH, [])
    if not isinstance(people, list):
        people = []

    ids_by_index = [profile_id(profile, index) for index, profile in enumerate(people)]
    represented_node_ids = sorted({node_id for profile in people for node_id in all_campaign_node_ids(profile)})

    try:
        cache_rows = db.list_people_cache()
        cache_error = ""
    except Exception as error:
        cache_rows = []
        cache_error = str(error)

    cache_ids = {str(row.get("profile_id") or "").strip() for row in cache_rows if str(row.get("profile_id") or "").strip()}
    file_ids = set(ids_by_index)

    duplicate_sets = []
    duplicate_sets.extend(find_duplicates(people, ids_by_index, "profile_id", lambda profile: profile.get("id")))
    duplicate_sets.extend(find_duplicates(people, ids_by_index, "display_name_normalized", display_name, normalize_text))
    duplicate_sets.extend(find_duplicates(people, ids_by_index, "sourceNodeId", lambda profile: profile.get("sourceNodeId")))
    duplicate_sets.extend(find_duplicates(people, ids_by_index, "campaignImport.nodeId", lambda profile: nested_value(profile, "campaignImport", "nodeId")))
    duplicate_sets.extend(find_duplicates(people, ids_by_index, "sourceIdentity.campaignCommandCenterNodeId", lambda profile: nested_value(profile, "sourceIdentity", "campaignCommandCenterNodeId")))

    group_counts = Counter(primary_group(profile) or "(missing)" for profile in people)
    source_counts = Counter()
    per_profile_source_counts = []
    for index, profile in enumerate(people):
        field_map = count_source_fields(profile)
        for field, present in field_map.items():
            if present:
                source_counts[field] += 1
        per_profile_source_counts.append(
            short_profile(
                profile,
                ids_by_index[index],
                {
                    "source_field_count": sum(1 for present in field_map.values() if present),
                    "fields": field_map,
                },
            )
        )

    conflicting_groups = []
    suspicious_groups = []
    missing_identity = []
    multiple_campaign_nodes = []

    for index, profile in enumerate(people):
        pid = ids_by_index[index]
        groups = group_values(profile)
        normalized_groups = []
        for group in groups:
            normalized = normalize_text(group)
            if normalized and normalized not in normalized_groups:
                normalized_groups.append(normalized)
        if len(normalized_groups) > 1:
            conflicting_groups.append(short_profile(profile, pid, {"group_values": groups}))

        group = primary_group(profile)
        if not group:
            suspicious_groups.append(short_profile(profile, pid, {"reason": "missing group/category label"}))
        elif group not in EXPECTED_GROUPS:
            suspicious_groups.append(short_profile(profile, pid, {"reason": "unexpected group/category label"}))

        missing_fields = []
        if not display_name(profile):
            missing_fields.append("display name")
        if not group:
            missing_fields.append("group/category")
        if not office_title(profile):
            missing_fields.append("office/title")
        if not jurisdiction(profile):
            missing_fields.append("state/jurisdiction")
        if missing_fields:
            missing_identity.append(short_profile(profile, pid, {"missing_fields": missing_fields}))

        node_ids = all_campaign_node_ids(profile)
        if len(node_ids) > 1:
            multiple_campaign_nodes.append(short_profile(profile, pid, {"campaign_node_ids": node_ids}))

    campaign_prefixed = [
        short_profile(
            profile,
            ids_by_index[index],
            {
                "current_id": ids_by_index[index],
                "later_canonical_candidate": slugify(display_name(profile)),
                "campaign_node_ids": all_campaign_node_ids(profile),
            },
        )
        for index, profile in enumerate(people)
        if ids_by_index[index].startswith("campaign-")
    ]

    unmatched_originals = [
        short_profile(
            profile,
            ids_by_index[index],
            {
                "bioguide_id": first_value(nested_value(profile, "sourceIdentity", "bioguideId")),
                "fec_candidate_id": first_value(nested_value(profile, "sourceIdentity", "fecCandidateId")),
                "office_title": office_title(profile),
                "state_or_jurisdiction": jurisdiction(profile),
            },
        )
        for index, profile in enumerate(people)
        if not ids_by_index[index].startswith("campaign-") and not has_value(profile.get("campaignImport"))
    ]

    imported_profiles = [
        ids_by_index[index]
        for index, profile in enumerate(people)
        if has_value(profile.get("campaignImport")) or all_campaign_node_ids(profile)
    ]

    report = {
        "generated_at": utc_now_iso(),
        "paths": {
            "people_json": str(PEOPLE_PATH),
            "database": str(db.DB_PATH),
        },
        "totals": {
            "people_json_profiles": len(people),
            "people_cache_profiles": len(cache_rows),
            "people_cache_error": cache_error,
            "people_cache_missing_file_ids": sorted(file_ids - cache_ids),
            "people_cache_extra_ids": sorted(cache_ids - file_ids),
            "campaign_prefixed_profiles": len(campaign_prefixed),
            "profiles_with_campaign_import_or_node": len(imported_profiles),
            "represented_campaign_node_ids": len(represented_node_ids),
            "unmatched_original_member_profiles": len(unmatched_originals),
        },
        "profile_count_explanation": {
            "summary": (
                "Current 95 = 83 campaign-prefixed imported profiles + 7 original Member IDs updated with Campaign data "
                "+ 5 original Member profiles with no Campaign match in the current roster. The 91 Campaign node associations "
                "are represented by 90 Campaign-linked profiles because one profile carries multiple Campaign node IDs."
            ),
            "campaign_prefixed_profile_count": len(campaign_prefixed),
            "original_member_profiles_with_campaign_data": len([
                pid for index, pid in enumerate(ids_by_index)
                if not pid.startswith("campaign-") and has_value(people[index].get("campaignImport"))
            ]),
            "unmatched_original_member_profile_count": len(unmatched_originals),
            "multiple_campaign_node_profile_count": len(multiple_campaign_nodes),
            "multiple_campaign_node_profiles": multiple_campaign_nodes,
        },
        "campaign_diagnostics": inspect_campaign_root(campaign_root, represented_node_ids),
        "group_counts": dict(sorted(group_counts.items())),
        "duplicates": duplicate_sets,
        "unmatched_original_member_profiles": unmatched_originals,
        "conflicting_or_multiple_group_memberships": conflicting_groups,
        "suspicious_group_category_labels": suspicious_groups,
        "campaign_prefixed_ids_for_later_canonicalization": campaign_prefixed,
        "missing_basic_identity_fields": missing_identity,
        "source_field_counts": dict(sorted(source_counts.items())),
        "source_field_coverage_by_profile": per_profile_source_counts,
        "scoring_recognition": build_scoring_audit(people, ids_by_index),
    }
    return report


def print_list(title: str, rows: List[Dict[str, Any]], limit: int = 12) -> None:
    print(title)
    if not rows:
        print("  None")
        return
    for row in rows[:limit]:
        suffix = ""
        extras = {key: value for key, value in row.items() if key not in {"profile_id", "display_name", "group"}}
        if extras:
            suffix = f" | {json.dumps(extras, ensure_ascii=False, sort_keys=True)}"
        print(f"  - {row.get('profile_id')} ({row.get('display_name')}){suffix}")
    if len(rows) > limit:
        print(f"  ... {len(rows) - limit} more")


def print_report(report: Dict[str, Any], report_path: Path) -> None:
    totals = report["totals"]
    explanation = report["profile_count_explanation"]
    campaign = report["campaign_diagnostics"]
    scoring = report["scoring_recognition"]

    print("Roster reconciliation audit")
    print("=" * 72)
    print(f"Report written: {report_path}")
    print("")
    print(f"Profiles in data/people.json: {totals['people_json_profiles']}")
    if totals["people_cache_error"]:
        print(f"Profiles visible through people_cache: ERROR - {totals['people_cache_error']}")
    else:
        print(f"Profiles visible through people_cache: {totals['people_cache_profiles']}")
    print(f"Campaign-prefixed profile IDs: {totals['campaign_prefixed_profiles']}")
    print(f"Campaign-linked profiles: {totals['profiles_with_campaign_import_or_node']}")
    print(f"Represented Campaign node IDs: {totals['represented_campaign_node_ids']}")
    print(f"Unmatched original Member profiles: {totals['unmatched_original_member_profiles']}")
    print("")
    print("95-profile explanation:")
    print(f"  {explanation['summary']}")
    print("")
    print("Campaign context:")
    print(f"  person_source_map entries: {campaign['person_source_map']['entry_count']}")
    print(f"  person_source_map represented: {campaign['person_source_map']['represented_count']}")
    print(f"  campaign_memory_store unique nodes: {campaign['campaign_memory_store']['unique_node_count']}")
    print(f"  campaign_memory_store represented: {campaign['campaign_memory_store']['represented_count']}")
    database = campaign["database"]
    if database.get("exists"):
        print(f"  campaign tracked_people: {database.get('tracked_people_count', 'unknown')}")
        print(f"  campaign person_roster_memberships: {database.get('person_roster_memberships_count', 'unknown')}")
    print("")
    print("Group counts:")
    for group, count in report["group_counts"].items():
        print(f"  {group}: {count}")
    print("")
    print("Source field counts:")
    for field, count in report["source_field_counts"].items():
        print(f"  {field}: {count}")
    print("")
    print_list("Duplicate findings:", report["duplicates"], limit=20)
    print("")
    print_list("Unmatched original Member profiles:", report["unmatched_original_member_profiles"], limit=20)
    print("")
    print_list("Conflicting or multiple group memberships:", report["conflicting_or_multiple_group_memberships"], limit=20)
    print("")
    print_list("Suspicious group/category labels:", report["suspicious_group_category_labels"], limit=20)
    print("")
    print_list("Campaign-prefixed IDs for possible later canonicalization:", report["campaign_prefixed_ids_for_later_canonicalization"], limit=15)
    print("")
    print_list("Profiles missing basic identity fields:", report["missing_basic_identity_fields"], limit=20)
    print("")
    print("Scoring recognition:")
    print(f"  Average readiness score from local scoring pass: {scoring['average_readiness_score']}")
    print(f"  Average hydration score from local scoring pass: {scoring['average_hydration_score']}")
    print("  Artificial-low risk buckets:")
    for key, rows in scoring["artificial_low_risk"].items():
        print(f"    {key}: {len(rows)}")
    if not scoring["artificial_low_risk"]:
        print("    None")
    print("  Artificial-high risk buckets:")
    for key, rows in scoring["artificial_high_risk"].items():
        print(f"    {key}: {len(rows)}")
    if not scoring["artificial_high_risk"]:
        print("    None")
    print("  Notes:")
    for note in scoring["notes"]:
        print(f"    - {note}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit Member Command Center roster reconciliation after Campaign import.")
    parser.add_argument("--campaign-root", default=str(DEFAULT_CAMPAIGN_ROOT), help="Optional Campaign Command Center root for source-count diagnostics.")
    parser.add_argument("--output", default="", help="Optional report path. Defaults to data/roster_reconciliation_report_<timestamp>.json.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    report_path = Path(args.output).resolve() if args.output else DATA_DIR / f"roster_reconciliation_report_{timestamp()}.json"
    report = build_report(Path(args.campaign_root).resolve())
    write_json(report_path, report)
    print_report(report, report_path)


if __name__ == "__main__":
    main()
