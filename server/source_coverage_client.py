from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


RUNNER_DEFINITIONS = [
    {
        "key": "openfec_finance",
        "label": "OpenFEC Finance",
        "category": "campaign_finance",
        "depends_on": "federal_or_fec_profile",
        "complete_when": "latest run completed and finance summary exists",
    },
    {
        "key": "congress_legislation",
        "label": "Congress.gov Legislation",
        "category": "federal_legislation",
        "depends_on": "federal_member_or_bioguide_profile",
        "complete_when": "latest run completed and meaningful legislation data exists",
    },
    {
        "key": "youtube_media",
        "label": "YouTube Media",
        "category": "media_video",
        "depends_on": "profile_identity",
        "complete_when": "latest run completed and channel/video summary exists",
    },
    {
        "key": "official_web_contact",
        "label": "Official Web + Contact",
        "category": "web_contact",
        "depends_on": "profile_identity",
        "complete_when": "latest run completed and URLs were evaluated",
    },
    {
        "key": "web_mentions",
        "label": "Web Mentions / Clippings",
        "category": "public_mentions",
        "depends_on": "profile_identity",
        "complete_when": "latest run completed and external mentions exist",
    },
    {
        "key": "openstates_legislation",
        "label": "OpenStates State Legislation",
        "category": "state_legislation",
        "depends_on": "state_legislative_profile",
        "complete_when": "latest run completed and OpenStates identity plus bill data exist",
    },
    {
        "key": "race_opponent_context",
        "label": "Race + Opponent Context",
        "category": "race_context",
        "depends_on": "profile_identity",
        "complete_when": "federal races use FEC-backed opponent discovery; state/local races scaffold cleanly",
    },
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def first_value(*values: Any) -> str:
    for value in values:
        if value is not None and str(value).strip() != "":
            return str(value).strip()

    return ""


def nested_value(source: Dict[str, Any], *path: str) -> str:
    current: Any = source

    for key in path:
        if not isinstance(current, dict):
            return ""

        current = current.get(key)

    if current is None:
        return ""

    return str(current).strip()


def normalize_lower(value: Any) -> str:
    return str(value or "").strip().lower()


def safe_int(value: Any) -> int:
    try:
        if value is None or value == "":
            return 0

        return int(value)
    except (TypeError, ValueError):
        return 0


def has_any_value(mapping: Dict[str, Any], keys: List[str]) -> bool:
    for key in keys:
        value = mapping.get(key)

        if value is None:
            continue

        if isinstance(value, (list, dict)) and len(value) > 0:
            return True

        if str(value).strip() != "":
            return True

    return False


def has_any_collection(mapping: Dict[str, Any], keys: List[str]) -> bool:
    for key in keys:
        value = mapping.get(key)

        if isinstance(value, list) and len(value) > 0:
            return True

        if isinstance(value, dict) and len(value) > 0:
            return True

    return False


def get_profile_id(person: Dict[str, Any], fallback: str = "") -> str:
    return first_value(
        person.get("profile_id"),
        person.get("profileId"),
        person.get("id"),
        nested_value(person, "sourceIdentity", "profile_id"),
        nested_value(person, "sourceIdentity", "profileId"),
        fallback,
    )


def get_profile_name(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("displayName"),
        person.get("name"),
        person.get("fullName"),
        nested_value(person, "identity", "fullName"),
        nested_value(person, "sourceIdentity", "displayName"),
    )


def get_office_type(person: Dict[str, Any]) -> str:
    raw = normalize_lower(
        first_value(
            person.get("officeTypeNormalized"),
            person.get("officeType"),
            person.get("title"),
            nested_value(person, "office", "type"),
            nested_value(person, "office", "title"),
            nested_value(person, "sourceIdentity", "officeType"),
        )
    )

    if "senate" in raw or "senator" in raw:
        return "senate"

    if "house" in raw or "representative" in raw or "congress" in raw:
        return "house"

    if "assembly" in raw or "delegate" in raw or "state rep" in raw:
        return "state_legislative"

    if "state" in raw and ("senator" in raw or "representative" in raw or "assembly" in raw):
        return "state_legislative"

    if raw == "state":
        return "state"

    if raw == "federal":
        return "federal"

    if "mayor" in raw:
        return "mayor"

    if "governor" in raw:
        return "governor"

    return raw or "unknown"


def get_fec_candidate_id(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("fecCandidateId"),
        nested_value(person, "ids", "fecCandidateId"),
        nested_value(person, "identifiers", "fecCandidateId"),
        nested_value(person, "sourceIdentity", "fecCandidateId"),
        nested_value(person, "campaignFinanceSnapshot", "fecCandidateId"),
    )


def get_bioguide_id(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("bioguideId"),
        person.get("bioguide_id"),
        nested_value(person, "ids", "bioguideId"),
        nested_value(person, "identifiers", "bioguideId"),
        nested_value(person, "sourceIdentity", "bioguideId"),
        nested_value(person, "legislativeSnapshot", "bioguideId"),
    )


def get_state_code(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("stateCode"),
        person.get("state"),
        nested_value(person, "office", "state"),
        nested_value(person, "sourceIdentity", "stateCode"),
        nested_value(person, "sourceIdentity", "state"),
    ).upper()


def is_federal_profile(person: Dict[str, Any]) -> bool:
    office_type = get_office_type(person)
    fec_candidate_id = get_fec_candidate_id(person).upper()

    if fec_candidate_id.startswith(("H", "S", "P")):
        return True

    if get_bioguide_id(person):
        return True

    return office_type in {"federal", "house", "senate"}


def is_state_legislative_profile(person: Dict[str, Any]) -> bool:
    office_type = get_office_type(person)
    title = normalize_lower(first_value(person.get("title"), nested_value(person, "office", "title")))

    if office_type == "state_legislative":
        return True

    if "assemblymember" in title or "state senator" in title or "state representative" in title:
        return True

    return False


def get_latest_run_by_module(latest_runs: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    runs_by_module: Dict[str, Dict[str, Any]] = {}

    for run in latest_runs:
        if not isinstance(run, dict):
            continue

        module_name = first_value(run.get("module_name"))

        if module_name:
            runs_by_module[module_name] = run

    return runs_by_module


def get_summary(run: Dict[str, Any]) -> Dict[str, Any]:
    summary = run.get("summary")

    return summary if isinstance(summary, dict) else {}


def get_diagnostics(run: Dict[str, Any]) -> Dict[str, Any]:
    diagnostics = run.get("diagnostics")

    return diagnostics if isinstance(diagnostics, dict) else {}


def get_request_error_count(run: Optional[Dict[str, Any]]) -> int:
    if not run:
        return 0

    summary = get_summary(run)
    diagnostics = get_diagnostics(run)

    return safe_int(summary.get("request_error_count") or diagnostics.get("request_error_count") or 0)


def is_runner_applicable(runner_key: str, person: Dict[str, Any]) -> bool:
    if runner_key in {"openfec_finance", "congress_legislation"}:
        return is_federal_profile(person)

    if runner_key == "openstates_legislation":
        return is_state_legislative_profile(person)

    return True


def get_not_applicable_reason(runner_key: str, person: Dict[str, Any]) -> str:
    if runner_key == "openfec_finance":
        return "No federal/FEC identity detected for this profile."

    if runner_key == "congress_legislation":
        return "No federal legislative identity detected for this profile."

    if runner_key == "openstates_legislation":
        return "Profile is not recognized as a state legislative profile."

    return "Not applicable."


def classify_completed_run_quality(runner_key: str, run: Dict[str, Any], person: Dict[str, Any]) -> str:
    summary = get_summary(run)
    diagnostics = get_diagnostics(run)
    request_error_count = get_request_error_count(run)

    if runner_key == "openfec_finance":
        has_finance_identity = has_any_value(summary, ["candidate_id", "fec_candidate_id", "committee_id", "fec_committee_id"])
        has_finance_number = has_any_value(
            summary,
            [
                "cash_on_hand_end_period",
                "cash_on_hand",
                "receipts",
                "disbursements",
                "total_receipts",
                "total_disbursements",
            ],
        )

        if has_finance_identity and has_finance_number and request_error_count == 0:
            return "complete"

        if has_finance_identity or has_finance_number:
            return "complete_with_warnings"

        return "partial"

    if runner_key == "congress_legislation":
        has_legislation_counts = has_any_value(
            summary,
            [
                "bills_returned",
                "sponsored_count",
                "cosponsored_count",
                "sponsored_bills_returned",
                "cosponsored_bills_returned",
                "actions_returned",
            ],
        )
        has_legislation_collections = has_any_collection(
            summary,
            [
                "bills",
                "recent_bills",
                "sponsored_bills",
                "cosponsored_bills",
                "actions",
                "legislation",
            ],
        )
        has_legislative_identity = has_any_value(summary, ["bioguide_id", "bioguideId", "member_id", "memberId"])

        if (has_legislation_counts or has_legislation_collections) and request_error_count == 0:
            return "complete"

        if has_legislation_counts or has_legislation_collections or has_legislative_identity:
            return "complete_with_warnings"

        return "partial"

    if runner_key == "youtube_media":
        has_channel = has_any_value(summary, ["channel_title", "channel_url", "channel_id"])
        has_video_metric = has_any_value(summary, ["video_count", "view_count", "subscriber_count", "latest_upload_date"])
        has_video_collection = has_any_collection(summary, ["latest_videos", "videos", "proof_video_links"])

        if (has_channel or has_video_metric or has_video_collection) and request_error_count == 0:
            return "complete"

        if has_channel or has_video_metric or has_video_collection:
            return "complete_with_warnings"

        return "partial"

    if runner_key == "official_web_contact":
        checked_count = safe_int(summary.get("urls_checked") or summary.get("total_urls_checked") or 0)
        healthy_count = safe_int(summary.get("healthy_urls") or summary.get("working_urls") or 0)
        failed_urls = summary.get("failed_urls")
        failed_count = len(failed_urls) if isinstance(failed_urls, list) else safe_int(summary.get("failed_urls") or 0)

        if checked_count > 0 and request_error_count == 0 and failed_count == 0:
            return "complete"

        if checked_count > 0 or healthy_count > 0 or failed_count > 0 or summary:
            return "complete_with_warnings"

        return "partial"

    if runner_key == "web_mentions":
        external_mentions = safe_int(summary.get("external_mentions_returned") or 0)
        feed_errors = summary.get("feed_errors")
        feed_error_count = len(feed_errors) if isinstance(feed_errors, list) else 0

        if external_mentions > 0 and request_error_count == 0 and feed_error_count == 0:
            return "complete"

        if external_mentions > 0:
            return "complete_with_warnings"

        return "partial"

    if runner_key == "openstates_legislation":
        has_identity = bool(summary.get("openstates_person_id") or summary.get("openstates_url"))
        has_bills = safe_int(summary.get("bills_returned") or 0) > 0
        has_votes = safe_int(summary.get("votes_returned") or 0) > 0
        has_committees = safe_int(summary.get("committees_returned") or 0) > 0

        if has_identity and has_bills and request_error_count == 0:
            return "complete"

        if has_identity and (has_bills or has_votes or has_committees):
            return "complete_with_warnings"

        if has_identity:
            return "partial"

        return "failed"

    if runner_key == "race_opponent_context":
        race_context_status = first_value(summary.get("race_context_status"))
        opponent_context_status = first_value(summary.get("opponent_context_status"))
        is_federal_fec_supported = bool(summary.get("is_federal_fec_supported"))

        if is_federal_fec_supported and opponent_context_status == "source_backed" and request_error_count == 0:
            return "complete"

        if is_federal_fec_supported and opponent_context_status == "source_backed":
            return "complete_with_warnings"

        if race_context_status in {"source_backed", "profile_scaffold"}:
            return "partial"

        return "partial"

    if diagnostics or summary:
        if request_error_count > 0:
            return "complete_with_warnings"

        return "complete"

    return "partial"


def classify_runner_status(runner_key: str, run: Optional[Dict[str, Any]], person: Dict[str, Any]) -> str:
    if not is_runner_applicable(runner_key, person):
        return "not_applicable"

    if not run:
        return "missing"

    run_status = normalize_lower(run.get("run_status"))

    if run_status == "completed":
        return classify_completed_run_quality(runner_key, run, person)

    if run_status == "partial":
        return "partial"

    if run_status == "failed":
        return "failed"

    return "partial"


def build_runner_action(runner_key: str, status: str, run: Optional[Dict[str, Any]], person: Dict[str, Any]) -> str:
    if status == "complete":
        return "No immediate action."

    if status == "complete_with_warnings":
        if runner_key == "openstates_legislation":
            return "Usable, but review OpenStates warnings.  Votes and committees may still need endpoint cleanup."

        if runner_key == "congress_legislation":
            return "Usable, but verify legislation counts or bill collections are present."

        if runner_key == "official_web_contact":
            return "Usable, but review failed or unverified URLs."

        if runner_key == "web_mentions":
            return "Usable, but review feed errors or partial clipping coverage."

        return f"Usable, but review latest {runner_key} warnings."

    if status == "not_applicable":
        return get_not_applicable_reason(runner_key, person)

    if status == "missing":
        return f"Run {runner_key} for this profile."

    if status == "failed":
        return f"Review latest {runner_key} error and rerun."

    if runner_key == "openstates_legislation":
        return "Review OpenStates identity/bill results.  Votes and committees may need endpoint-specific cleanup."

    if runner_key == "race_opponent_context":
        if not is_federal_profile(person):
            return "Add state/local election filing source for non-federal race context."

        return "Review FEC-discovered candidates and mark true opponents vs false positives."

    if runner_key == "web_mentions":
        return "Review web mentions and consider increasing coverage sources if needed."

    if runner_key == "official_web_contact":
        return "Review missing or failed official/contact/social URLs."

    return f"Review latest {runner_key} run and fill missing fields."


def build_runner_notes(runner_key: str, status: str, run: Optional[Dict[str, Any]]) -> List[str]:
    notes: List[str] = []

    if not run:
        if status == "not_applicable":
            return notes

        notes.append("No saved run found.")
        return notes

    summary = get_summary(run)
    diagnostics = get_diagnostics(run)

    if status == "complete_with_warnings":
        notes.append("Usable, but warnings remain.")

    if runner_key == "congress_legislation":
        bills_returned = summary.get("bills_returned")
        sponsored_count = summary.get("sponsored_count")
        cosponsored_count = summary.get("cosponsored_count")

        if bills_returned is not None:
            notes.append(f"Bills: {bills_returned}")

        if sponsored_count is not None:
            notes.append(f"Sponsored: {sponsored_count}")

        if cosponsored_count is not None:
            notes.append(f"Cosponsored: {cosponsored_count}")

        if not notes:
            notes.append("Legislation summary metrics are sparse.")

    if runner_key == "web_mentions":
        notes.append(f"External mentions: {summary.get('external_mentions_returned', 0)}")

    if runner_key == "openstates_legislation":
        notes.append(f"Bills: {summary.get('bills_returned', 0)}")
        notes.append(f"Votes: {summary.get('votes_returned', 0)}")
        notes.append(f"Committees: {summary.get('committees_returned', 0)}")

    if runner_key == "race_opponent_context":
        notes.append(f"Candidate pool: {summary.get('candidate_pool_count', 0)}")
        notes.append(f"Source-backed opponents: {summary.get('source_backed_opponent_count', 0)}")

    request_error_count = safe_int(summary.get("request_error_count") or diagnostics.get("request_error_count") or 0)

    if request_error_count > 0:
        notes.append(f"Request errors: {request_error_count}")

    return notes


def build_runner_row(definition: Dict[str, Any], run: Optional[Dict[str, Any]], person: Dict[str, Any]) -> Dict[str, Any]:
    runner_key = definition["key"]
    status = classify_runner_status(runner_key, run, person)
    summary = get_summary(run) if run else {}
    diagnostics = get_diagnostics(run) if run else {}

    return {
        "module_name": runner_key,
        "label": definition["label"],
        "category": definition["category"],
        "status": status,
        "latest_run_id": run.get("run_id") if run else "",
        "latest_run_status": run.get("run_status") if run else "",
        "latest_run_created_at": run.get("created_at") if run else "",
        "latest_run_completed_at": run.get("completed_at") if run else "",
        "summary_metrics": extract_summary_metrics(runner_key, summary),
        "request_error_count": safe_int(summary.get("request_error_count") or diagnostics.get("request_error_count") or 0),
        "notes": build_runner_notes(runner_key, status, run),
        "next_action": build_runner_action(runner_key, status, run, person),
        "is_applicable": status != "not_applicable",
    }


def extract_summary_metrics(runner_key: str, summary: Dict[str, Any]) -> Dict[str, Any]:
    if runner_key == "openfec_finance":
        return {
            "candidate_id": summary.get("candidate_id") or summary.get("fec_candidate_id"),
            "committee_id": summary.get("committee_id") or summary.get("fec_committee_id"),
            "cash_on_hand": summary.get("cash_on_hand_end_period") or summary.get("cash_on_hand"),
        }

    if runner_key == "congress_legislation":
        return {
            "bills_returned": summary.get("bills_returned"),
            "sponsored_count": summary.get("sponsored_count"),
            "cosponsored_count": summary.get("cosponsored_count"),
            "has_legislation_collections": has_any_collection(
                summary,
                [
                    "bills",
                    "recent_bills",
                    "sponsored_bills",
                    "cosponsored_bills",
                    "actions",
                    "legislation",
                ],
            ),
        }

    if runner_key == "youtube_media":
        return {
            "channel_title": summary.get("channel_title"),
            "video_count": summary.get("video_count"),
            "latest_upload_date": summary.get("latest_upload_date"),
        }

    if runner_key == "official_web_contact":
        return {
            "urls_checked": summary.get("urls_checked") or summary.get("total_urls_checked"),
            "healthy_urls": summary.get("healthy_urls") or summary.get("working_urls"),
            "failed_urls": summary.get("failed_urls"),
        }

    if runner_key == "web_mentions":
        return {
            "external_mentions_returned": summary.get("external_mentions_returned"),
            "raw_results_returned": summary.get("raw_results_returned"),
            "latest_published_date": summary.get("latest_published_date"),
        }

    if runner_key == "openstates_legislation":
        return {
            "openstates_person_id": summary.get("openstates_person_id"),
            "bills_returned": summary.get("bills_returned"),
            "votes_returned": summary.get("votes_returned"),
            "committees_returned": summary.get("committees_returned"),
        }

    if runner_key == "race_opponent_context":
        return {
            "race_label": summary.get("race_label"),
            "candidate_pool_count": summary.get("candidate_pool_count"),
            "source_backed_opponent_count": summary.get("source_backed_opponent_count"),
            "opponent_context_status": summary.get("opponent_context_status"),
        }

    return {}


def count_statuses(rows: List[Dict[str, Any]]) -> Dict[str, int]:
    counts = {
        "complete": 0,
        "complete_with_warnings": 0,
        "partial": 0,
        "missing": 0,
        "failed": 0,
        "not_applicable": 0,
    }

    for row in rows:
        status = row.get("status")

        if status in counts:
            counts[status] += 1

    return counts


def calculate_completion_score(status_counts: Dict[str, int]) -> int:
    applicable_total = (
        status_counts.get("complete", 0)
        + status_counts.get("complete_with_warnings", 0)
        + status_counts.get("partial", 0)
        + status_counts.get("missing", 0)
        + status_counts.get("failed", 0)
    )

    if applicable_total <= 0:
        return 0

    score = (
        status_counts.get("complete", 0) * 1.0
        + status_counts.get("complete_with_warnings", 0) * 0.8
        + status_counts.get("partial", 0) * 0.5
    ) / applicable_total

    return round(score * 100)


def pick_next_best_action(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    priority_order = [
        "failed",
        "missing",
        "partial",
        "complete_with_warnings",
    ]

    priority_modules = [
        "race_opponent_context",
        "official_web_contact",
        "web_mentions",
        "openfec_finance",
        "congress_legislation",
        "openstates_legislation",
        "youtube_media",
    ]

    for status in priority_order:
        candidates = [row for row in rows if row.get("status") == status]

        if not candidates:
            continue

        candidates.sort(
            key=lambda row: priority_modules.index(row["module_name"])
            if row["module_name"] in priority_modules
            else 999
        )

        selected = candidates[0]

        return {
            "module_name": selected.get("module_name"),
            "label": selected.get("label"),
            "status": selected.get("status"),
            "next_action": selected.get("next_action"),
        }

    return {
        "module_name": "",
        "label": "",
        "status": "complete",
        "next_action": "No immediate action.",
    }


def build_profile_coverage(profile_id: str, person: Dict[str, Any], latest_runs: List[Dict[str, Any]]) -> Dict[str, Any]:
    runs_by_module = get_latest_run_by_module(latest_runs)
    rows = []

    for definition in RUNNER_DEFINITIONS:
        run = runs_by_module.get(definition["key"])
        rows.append(build_runner_row(definition, run, person))

    status_counts = count_statuses(rows)

    return {
        "profile_id": profile_id,
        "profile_name": get_profile_name(person),
        "generated_at": utc_now_iso(),
        "profile_type": {
            "office_type": get_office_type(person),
            "state": get_state_code(person),
            "is_federal_profile": is_federal_profile(person),
            "is_state_legislative_profile": is_state_legislative_profile(person),
            "fec_candidate_id": get_fec_candidate_id(person),
            "bioguide_id": get_bioguide_id(person),
        },
        "completion_score": calculate_completion_score(status_counts),
        "status_counts": status_counts,
        "next_best_action": pick_next_best_action(rows),
        "coverage_rows": rows,
    }


def build_all_profiles_coverage(cached_people: List[Dict[str, Any]], latest_runs_loader) -> Dict[str, Any]:
    profiles = []

    for cached_person in cached_people:
        profile_id = first_value(cached_person.get("profile_id"))

        if not profile_id:
            continue

        source_json = cached_person.get("source_json")
        person = source_json if isinstance(source_json, dict) else {}
        person.setdefault("profile_id", profile_id)
        person.setdefault("displayName", cached_person.get("display_name"))

        latest_runs = latest_runs_loader(profile_id)
        profiles.append(build_profile_coverage(profile_id, person, latest_runs))

    aggregate_counts = {
        "complete": 0,
        "complete_with_warnings": 0,
        "partial": 0,
        "missing": 0,
        "failed": 0,
        "not_applicable": 0,
    }

    for profile in profiles:
        for key, value in profile.get("status_counts", {}).items():
            if key in aggregate_counts:
                aggregate_counts[key] += int(value or 0)

    profiles.sort(key=lambda profile: profile.get("completion_score", 0), reverse=True)

    return {
        "generated_at": utc_now_iso(),
        "profile_count": len(profiles),
        "aggregate_status_counts": aggregate_counts,
        "average_completion_score": round(
            sum(profile.get("completion_score", 0) for profile in profiles) / len(profiles)
        )
        if profiles
        else 0,
        "profiles": profiles,
    }