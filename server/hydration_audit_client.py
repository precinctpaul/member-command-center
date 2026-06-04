from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional


STATUS_POPULATED = "populated"
STATUS_EMPTY = "empty"
STATUS_SCAFFOLDED = "scaffolded"
STATUS_PARTIAL = "partial"
STATUS_NOT_APPLICABLE = "not_applicable"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def first_value(*values: Any) -> str:
    for value in values:
        if value is not None and str(value).strip() != "":
            return str(value).strip()

    return ""


def safe_int(value: Any) -> int:
    try:
        if value is None or value == "":
            return 0

        return int(value)
    except (TypeError, ValueError):
        return 0


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


def has_content(value: Any) -> bool:
    if value is None:
        return False

    if isinstance(value, str):
        return value.strip() != ""

    if isinstance(value, (list, dict)):
        return len(value) > 0

    return True


def has_any(mapping: Dict[str, Any], keys: List[str]) -> bool:
    for key in keys:
        if has_content(mapping.get(key)):
            return True

    return False


def get_summary(run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not run:
        return {}

    return as_dict(run.get("summary"))


def get_diagnostics(run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not run:
        return {}

    return as_dict(run.get("diagnostics"))


def get_raw(run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not run:
        return {}

    return as_dict(run.get("raw"))


def latest_run_by_module(latest_runs: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    indexed: Dict[str, Dict[str, Any]] = {}

    for run in latest_runs:
        if not isinstance(run, dict):
            continue

        module_name = first_value(run.get("module_name"))

        if module_name:
            indexed[module_name] = run

    return indexed


def get_profile_name(person: Dict[str, Any], fallback: str = "") -> str:
    return first_value(
        person.get("displayName"),
        person.get("name"),
        person.get("fullName"),
        nested_value(person, "identity", "fullName"),
        nested_value(person, "sourceIdentity", "displayName"),
        fallback,
    )


def get_profile_party(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("party"),
        nested_value(person, "identity", "party"),
        nested_value(person, "sourceIdentity", "party"),
    )


def get_profile_title(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("title"),
        person.get("officeTitle"),
        nested_value(person, "office", "title"),
        nested_value(person, "sourceIdentity", "title"),
    )


def get_profile_state(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("state"),
        person.get("stateCode"),
        nested_value(person, "office", "state"),
        nested_value(person, "sourceIdentity", "state"),
        nested_value(person, "sourceIdentity", "stateCode"),
    ).upper()


def get_profile_district(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("district"),
        person.get("districtLabel"),
        nested_value(person, "office", "district"),
        nested_value(person, "sourceIdentity", "district"),
        nested_value(person, "sourceIdentity", "districtLabel"),
    )


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


def get_office_type(person: Dict[str, Any]) -> str:
    raw = first_value(
        person.get("officeTypeNormalized"),
        person.get("officeType"),
        person.get("office_type"),
        get_profile_title(person),
        nested_value(person, "office", "type"),
        nested_value(person, "sourceIdentity", "officeType"),
    ).lower()

    if "house" in raw or "representative" in raw or "congress" in raw:
        return "federal_house"

    if "senate" in raw or "senator" in raw:
        if get_fec_candidate_id(person).upper().startswith("S") or get_bioguide_id(person):
            return "federal_senate"
        return "state_legislative"

    if "assembly" in raw or "delegate" in raw or "state rep" in raw:
        return "state_legislative"

    if "mayor" in raw:
        return "mayor"

    if "governor" in raw:
        return "governor"

    if "federal" in raw:
        return "federal"

    if "state" in raw:
        return "state"

    return raw or "unknown"


def is_federal_profile(person: Dict[str, Any]) -> bool:
    fec_candidate_id = get_fec_candidate_id(person).upper()
    office_type = get_office_type(person)

    if fec_candidate_id.startswith(("H", "S", "P")):
        return True

    if get_bioguide_id(person):
        return True

    return office_type in {"federal", "federal_house", "federal_senate"}


def is_state_legislative_profile(person: Dict[str, Any]) -> bool:
    return get_office_type(person) == "state_legislative"


def classify_from_fields(
    populated: bool,
    scaffolded: bool = False,
    partial: bool = False,
    applicable: bool = True,
) -> str:
    if not applicable:
        return STATUS_NOT_APPLICABLE

    if populated and not partial and not scaffolded:
        return STATUS_POPULATED

    if populated and partial:
        return STATUS_PARTIAL

    if scaffolded:
        return STATUS_SCAFFOLDED

    return STATUS_EMPTY


def make_field(
    field: str,
    label: str,
    status: str,
    current_value: Any = "",
    source_needed: str = "",
    runner_available: bool = False,
    recommended_next_runner: str = "",
    notes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return {
        "field": field,
        "label": label,
        "status": status,
        "current_value": current_value,
        "source_needed": source_needed,
        "runner_available": runner_available,
        "recommended_next_runner": recommended_next_runner,
        "notes": notes or [],
    }


def make_category(
    key: str,
    label: str,
    fields: List[Dict[str, Any]],
    description: str = "",
) -> Dict[str, Any]:
    status_counts = {
        STATUS_POPULATED: 0,
        STATUS_EMPTY: 0,
        STATUS_SCAFFOLDED: 0,
        STATUS_PARTIAL: 0,
        STATUS_NOT_APPLICABLE: 0,
    }

    for field in fields:
        status = field.get("status")
        if status in status_counts:
            status_counts[status] += 1

    applicable_total = (
        status_counts[STATUS_POPULATED]
        + status_counts[STATUS_EMPTY]
        + status_counts[STATUS_SCAFFOLDED]
        + status_counts[STATUS_PARTIAL]
    )

    if applicable_total == 0:
        hydration_score = 0
        category_status = STATUS_NOT_APPLICABLE
    else:
        hydration_score = round(
            (
                status_counts[STATUS_POPULATED] * 1.0
                + status_counts[STATUS_PARTIAL] * 0.55
                + status_counts[STATUS_SCAFFOLDED] * 0.25
            )
            / applicable_total
            * 100
        )

        if status_counts[STATUS_EMPTY] > 0:
            category_status = STATUS_PARTIAL if status_counts[STATUS_POPULATED] > 0 or status_counts[STATUS_PARTIAL] > 0 else STATUS_EMPTY
        elif status_counts[STATUS_SCAFFOLDED] > 0:
            category_status = STATUS_SCAFFOLDED
        elif status_counts[STATUS_PARTIAL] > 0:
            category_status = STATUS_PARTIAL
        else:
            category_status = STATUS_POPULATED

    return {
        "category": key,
        "label": label,
        "description": description,
        "status": category_status,
        "hydration_score": hydration_score,
        "status_counts": status_counts,
        "fields": fields,
    }


def build_core_identity_category(person: Dict[str, Any]) -> Dict[str, Any]:
    fields = [
        make_field(
            "name",
            "Name",
            classify_from_fields(has_content(get_profile_name(person))),
            get_profile_name(person),
            "Profile seed / official source",
            True,
            "official_web_contact",
        ),
        make_field(
            "title",
            "Current title",
            classify_from_fields(has_content(get_profile_title(person))),
            get_profile_title(person),
            "Official bio / OpenStates / Congress.gov",
            True,
            "official_web_contact",
        ),
        make_field(
            "party",
            "Party",
            classify_from_fields(has_content(get_profile_party(person))),
            get_profile_party(person),
            "Profile seed / OpenStates / FEC / Congress.gov",
            True,
            "race_opponent_context",
        ),
        make_field(
            "state",
            "State",
            classify_from_fields(has_content(get_profile_state(person))),
            get_profile_state(person),
            "Profile seed / official source",
            True,
            "official_web_contact",
        ),
        make_field(
            "district",
            "District",
            classify_from_fields(has_content(get_profile_district(person))),
            get_profile_district(person),
            "Profile seed / election source",
            True,
            "race_opponent_context",
        ),
        make_field(
            "headshot",
            "Headshot",
            classify_from_fields(has_content(first_value(person.get("headshot"), person.get("headshotUrl"), person.get("image"), nested_value(person, "identity", "headshotUrl")))),
            first_value(person.get("headshot"), person.get("headshotUrl"), person.get("image"), nested_value(person, "identity", "headshotUrl")),
            "Official bio / Congress.gov / OpenStates",
            True,
            "official_web_contact",
        ),
    ]

    return make_category("core_identity", "Core Identity", fields, "Basic profile identity fields.")


def build_biographical_category(person: Dict[str, Any]) -> Dict[str, Any]:
    bio = first_value(
        person.get("bio"),
        person.get("biography"),
        person.get("shortBio"),
        nested_value(person, "identity", "bio"),
        nested_value(person, "profile", "bio"),
    )

    fields = [
        make_field(
            "bio",
            "Biography",
            classify_from_fields(has_content(bio)),
            bio[:220] if isinstance(bio, str) else bio,
            "Official bio / website / Congress.gov / OpenStates",
            True,
            "official_web_contact",
        ),
        make_field(
            "official_sources",
            "Official source links",
            classify_from_fields(has_content(person.get("officialSources")) or has_content(person.get("sources")) or has_content(nested_value(person, "sourceIdentity", "sources"))),
            first_value(person.get("officialSources"), person.get("sources"), nested_value(person, "sourceIdentity", "sources")),
            "Official website / source runner outputs",
            True,
            "official_web_contact",
        ),
        make_field(
            "aliases",
            "Aliases / alternate names",
            classify_from_fields(has_content(person.get("aliases")) or has_content(person.get("otherNames")) or has_content(nested_value(person, "sourceIdentity", "other_names"))),
            first_value(person.get("aliases"), person.get("otherNames"), nested_value(person, "sourceIdentity", "other_names")),
            "OpenStates / profile seed",
            True,
            "openstates_legislation",
        ),
    ]

    return make_category("biographical_profile", "Biographical Profile", fields, "Narrative and alias information.")


def build_official_web_category(runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    run = runs_by_module.get("official_web_contact")
    summary = get_summary(run)

    has_run = bool(run)
    urls_checked = safe_int(summary.get("urls_checked"))
    reachable_count = safe_int(summary.get("reachable_count"))
    contact_count = safe_int(summary.get("contact_url_count"))
    social_count = safe_int(summary.get("social_url_count"))

    fields = [
        make_field(
            "official_website",
            "Official website",
            classify_from_fields(has_content(summary.get("primary_official_url")), partial=has_run and not has_content(summary.get("primary_official_url"))),
            summary.get("primary_official_url", ""),
            "Official website verification",
            True,
            "official_web_contact",
        ),
        make_field(
            "campaign_website",
            "Campaign website",
            classify_from_fields(has_content(summary.get("primary_campaign_url")), partial=has_run and not has_content(summary.get("primary_campaign_url"))),
            summary.get("primary_campaign_url", ""),
            "Campaign website discovery/verification",
            True,
            "official_web_contact",
        ),
        make_field(
            "contact_url",
            "Contact form / contact URL",
            classify_from_fields(has_content(summary.get("primary_contact_url")) or contact_count > 0, partial=has_run and contact_count == 0),
            summary.get("primary_contact_url", ""),
            "Official website contact pages",
            True,
            "official_web_contact",
        ),
        make_field(
            "social_links",
            "Social links",
            classify_from_fields(social_count > 0, partial=has_run and social_count == 0),
            social_count,
            "Official/campaign/social link discovery",
            True,
            "official_web_contact",
        ),
        make_field(
            "url_health",
            "URL health",
            classify_from_fields(urls_checked > 0 and reachable_count > 0, partial=has_run and urls_checked > 0),
            {"urls_checked": urls_checked, "reachable_count": reachable_count, "failed_count": summary.get("failed_count", 0)},
            "Official web/contact runner",
            True,
            "official_web_contact",
        ),
    ]

    return make_category("official_web_contact", "Official Web and Contact", fields, "Official, campaign, contact, social, and URL health coverage.")


def build_finance_category(person: Dict[str, Any], runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    applicable = is_federal_profile(person)
    run = runs_by_module.get("openfec_finance")
    summary = get_summary(run)
    has_run = bool(run)

    fields = [
        make_field(
            "fec_candidate_id",
            "FEC candidate ID",
            classify_from_fields(has_content(first_value(summary.get("candidate_id"), summary.get("fec_candidate_id"), get_fec_candidate_id(person))), applicable=applicable),
            first_value(summary.get("candidate_id"), summary.get("fec_candidate_id"), get_fec_candidate_id(person)),
            "OpenFEC / profile seed",
            True,
            "openfec_finance",
        ),
        make_field(
            "committee_id",
            "Principal committee ID",
            classify_from_fields(has_content(first_value(summary.get("committee_id"), summary.get("fec_committee_id"))), partial=has_run, applicable=applicable),
            first_value(summary.get("committee_id"), summary.get("fec_committee_id")),
            "OpenFEC committee lookup",
            True,
            "openfec_finance",
        ),
        make_field(
            "cash_on_hand",
            "Cash on hand",
            classify_from_fields(has_content(summary.get("cash_on_hand")) or has_content(summary.get("cash_on_hand_end_period")), partial=has_run, applicable=applicable),
            first_value(summary.get("cash_on_hand"), summary.get("cash_on_hand_end_period")),
            "OpenFEC totals/filings",
            True,
            "openfec_finance",
        ),
        make_field(
            "receipts_disbursements",
            "Receipts and disbursements",
            classify_from_fields(has_content(summary.get("total_receipts")) or has_content(summary.get("total_disbursements")), partial=has_run, applicable=applicable),
            {"receipts": summary.get("total_receipts"), "disbursements": summary.get("total_disbursements")},
            "OpenFEC totals/filings",
            True,
            "openfec_finance",
        ),
        make_field(
            "recent_filings",
            "Recent filings",
            classify_from_fields(safe_int(summary.get("recent_filings_returned")) > 0 or has_content(summary.get("recent_filings")), partial=has_run, applicable=applicable),
            summary.get("recent_filings_returned", 0),
            "OpenFEC filings",
            True,
            "openfec_finance",
        ),
        make_field(
            "state_local_finance",
            "State/local campaign finance",
            STATUS_NOT_APPLICABLE if applicable else STATUS_EMPTY,
            "",
            "State campaign finance portals",
            False,
            "state_local_finance_runner_needed",
            ["Federal OpenFEC does not cover state/local campaign finance."],
        ),
    ]

    return make_category("campaign_finance", "Campaign Finance", fields, "Federal finance coverage and state/local finance gaps.")


def build_race_context_category(person: Dict[str, Any], runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    run = runs_by_module.get("race_opponent_context")
    summary = get_summary(run)
    has_run = bool(run)
    is_federal_supported = summary.get("is_federal_fec_supported") is True

    fields = [
        make_field(
            "race_label",
            "Race label",
            classify_from_fields(has_content(summary.get("race_label")), partial=has_run),
            summary.get("race_label", ""),
            "OpenFEC / profile race scaffold",
            True,
            "race_opponent_context",
        ),
        make_field(
            "candidate_pool",
            "Candidate pool",
            classify_from_fields(safe_int(summary.get("candidate_pool_count")) > 0, partial=has_run and is_federal_supported, scaffolded=has_run and not is_federal_supported),
            summary.get("candidate_pool_count", 0),
            "OpenFEC candidate search for federal races; state/local filing portals for non-federal races",
            True if is_federal_profile(person) else False,
            "race_opponent_context" if is_federal_profile(person) else "state_local_filing_runner_needed",
        ),
        make_field(
            "source_backed_opponents",
            "Source-backed opponents",
            classify_from_fields(safe_int(summary.get("source_backed_opponent_count")) > 0, partial=has_run and is_federal_supported, scaffolded=has_run and not is_federal_supported),
            summary.get("source_backed_opponent_count", 0),
            "OpenFEC candidate search / state filing sources",
            True if is_federal_profile(person) else False,
            "race_opponent_context" if is_federal_profile(person) else "state_local_filing_runner_needed",
        ),
        make_field(
            "race_rating",
            "Race rating / electoral strength",
            STATUS_EMPTY,
            "",
            "Cook/Sabato/Inside Elections/manual race rating source",
            False,
            "race_rating_source_needed",
        ),
        make_field(
            "state_local_filing_status",
            "State/local filing status",
            STATUS_NOT_APPLICABLE if is_federal_profile(person) else STATUS_EMPTY,
            "",
            "Secretary of State / state elections filing portals",
            False,
            "state_local_filing_runner_needed",
        ),
    ]

    return make_category("race_context", "Race and Election Context", fields, "Race, opponent pool, filing, and electoral-strength coverage.")


def build_opposition_category(runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    run = runs_by_module.get("race_opponent_context")
    summary = get_summary(run)
    has_run = bool(run)
    opponent_count = safe_int(summary.get("source_backed_opponent_count"))
    opponents = as_list(summary.get("source_backed_opponents"))

    raised_funds_count = 0
    committee_id_count = 0
    profile_ready_count = 0

    for opponent in opponents:
        if not isinstance(opponent, dict):
            continue

        if opponent.get("has_raised_funds") is True:
            raised_funds_count += 1

        principal_committee_ids = opponent.get("principal_committee_ids")
        if isinstance(principal_committee_ids, list) and principal_committee_ids:
            committee_id_count += 1

        if has_content(opponent.get("profile_id")):
            profile_ready_count += 1

    fields = [
        make_field(
            "opponent_discovery",
            "Opponent discovery",
            classify_from_fields(opponent_count > 0, partial=has_run),
            opponent_count,
            "Race/opponent context runner",
            True,
            "race_opponent_context",
        ),
        make_field(
            "opponent_baseline_info",
            "Opponent baseline information",
            classify_from_fields(opponent_count > 0, partial=has_run),
            [{"name": opponent.get("name"), "candidate_id": opponent.get("candidate_id"), "party": opponent.get("party")} for opponent in opponents if isinstance(opponent, dict)],
            "OpenFEC candidate search / state filing sources",
            True,
            "race_opponent_context",
        ),
        make_field(
            "opponent_finance_flags",
            "Opponent finance flags",
            classify_from_fields(raised_funds_count > 0, partial=has_run and opponent_count > 0),
            raised_funds_count,
            "OpenFEC candidate pool / future opponent finance runs",
            True,
            "race_opponent_context",
        ),
        make_field(
            "opponent_committee_ids",
            "Opponent committee IDs",
            classify_from_fields(committee_id_count > 0, partial=has_run and opponent_count > 0),
            committee_id_count,
            "OpenFEC candidate details / committee lookup",
            True,
            "race_opponent_context",
        ),
        make_field(
            "opponent_profiles",
            "Promoted opponent profiles",
            classify_from_fields(profile_ready_count > 0, partial=has_run and opponent_count > 0),
            profile_ready_count,
            "Opponent promotion workflow",
            False,
            "opponent_profile_promotion_needed",
        ),
        make_field(
            "opponent_web_media_checks",
            "Opponent web/media/mentions checks",
            STATUS_EMPTY if opponent_count > 0 else STATUS_NOT_APPLICABLE,
            "",
            "Run existing web/media/official source checks against promoted opponent profiles",
            False,
            "opponent_profile_promotion_needed",
        ),
    ]

    return make_category("opposition_intelligence", "Opponent / Opposition Intelligence", fields, "Opponent discovery, segmentation, finance flags, and promotion gaps.")


def build_legislative_category(person: Dict[str, Any], runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    federal_applicable = is_federal_profile(person)
    state_applicable = is_state_legislative_profile(person)

    congress_run = runs_by_module.get("congress_legislation")
    congress_summary = get_summary(congress_run)
    openstates_run = runs_by_module.get("openstates_legislation")
    openstates_summary = get_summary(openstates_run)

    fields = [
        make_field(
            "congress_bioguide",
            "Congress.gov Bioguide ID",
            classify_from_fields(has_content(first_value(congress_summary.get("bioguide_id"), get_bioguide_id(person))), partial=bool(congress_run), applicable=federal_applicable),
            first_value(congress_summary.get("bioguide_id"), get_bioguide_id(person)),
            "Congress.gov",
            True,
            "congress_legislation",
        ),
        make_field(
            "congress_sponsored",
            "Sponsored legislation",
            classify_from_fields(safe_int(congress_summary.get("sponsored_returned")) > 0 or has_content(congress_summary.get("sponsored_legislation")), partial=bool(congress_run), applicable=federal_applicable),
            congress_summary.get("sponsored_returned", 0),
            "Congress.gov sponsored legislation",
            True,
            "congress_legislation",
        ),
        make_field(
            "congress_cosponsored",
            "Cosponsored legislation",
            classify_from_fields(safe_int(congress_summary.get("cosponsored_returned")) > 0 or has_content(congress_summary.get("cosponsored_legislation")), partial=bool(congress_run), applicable=federal_applicable),
            congress_summary.get("cosponsored_returned", 0),
            "Congress.gov cosponsored legislation",
            True,
            "congress_legislation",
        ),
        make_field(
            "openstates_identity",
            "OpenStates identity",
            classify_from_fields(has_content(openstates_summary.get("openstates_person_id")), partial=bool(openstates_run), applicable=state_applicable),
            openstates_summary.get("openstates_person_id", ""),
            "OpenStates people lookup",
            True,
            "openstates_legislation",
        ),
        make_field(
            "openstates_bills",
            "OpenStates bills",
            classify_from_fields(safe_int(openstates_summary.get("bills_returned")) > 0, partial=bool(openstates_run), applicable=state_applicable),
            openstates_summary.get("bills_returned", 0),
            "OpenStates bill search",
            True,
            "openstates_legislation",
        ),
        make_field(
            "votes_committees",
            "Votes and committees",
            classify_from_fields(safe_int(openstates_summary.get("votes_returned")) > 0 or safe_int(openstates_summary.get("committees_returned")) > 0, partial=bool(openstates_run), applicable=state_applicable),
            {"votes": openstates_summary.get("votes_returned", 0), "committees": openstates_summary.get("committees_returned", 0)},
            "OpenStates votes/committees endpoints, endpoint cleanup needed",
            True,
            "openstates_legislation",
        ),
    ]

    return make_category("legislative_activity", "Legislative / Official Activity", fields, "Federal and state legislative coverage.")


def build_media_category(runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    youtube_run = runs_by_module.get("youtube_media")
    youtube_summary = get_summary(youtube_run)
    mentions_run = runs_by_module.get("web_mentions")
    mentions_summary = get_summary(mentions_run)

    fields = [
        make_field(
            "youtube_channel",
            "YouTube channel",
            classify_from_fields(has_content(youtube_summary.get("channel_title")) or has_content(youtube_summary.get("channel_url")), partial=bool(youtube_run)),
            first_value(youtube_summary.get("channel_title"), youtube_summary.get("channel_url")),
            "YouTube Data API",
            True,
            "youtube_media",
        ),
        make_field(
            "youtube_latest_videos",
            "Latest videos",
            classify_from_fields(has_content(youtube_summary.get("latest_videos")) or has_content(youtube_summary.get("videos")), partial=bool(youtube_run)),
            safe_int(youtube_summary.get("video_count")),
            "YouTube Data API",
            True,
            "youtube_media",
        ),
        make_field(
            "web_mentions",
            "Web mentions / clippings",
            classify_from_fields(safe_int(mentions_summary.get("external_mentions_returned")) > 0 or has_content(mentions_summary.get("external_mentions")), partial=bool(mentions_run)),
            mentions_summary.get("external_mentions_returned", 0),
            "RSS/web mentions runner",
            True,
            "web_mentions",
        ),
        make_field(
            "latest_public_attention_date",
            "Latest public attention date",
            classify_from_fields(has_content(mentions_summary.get("latest_published_date")) or has_content(youtube_summary.get("latest_upload_date")), partial=bool(mentions_run or youtube_run)),
            first_value(mentions_summary.get("latest_published_date"), youtube_summary.get("latest_upload_date")),
            "RSS web mentions / YouTube",
            True,
            "web_mentions",
        ),
        make_field(
            "cspan_video",
            "C-SPAN / hearing video inventory",
            STATUS_EMPTY,
            "",
            "C-SPAN or video archive source",
            False,
            "video_archive_runner_needed",
        ),
    ]

    return make_category("media_public_attention", "Media / Public Attention", fields, "Video, public mentions, and media coverage.")


def build_geography_category(person: Dict[str, Any], runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    race_summary = get_summary(runs_by_module.get("race_opponent_context"))

    state = first_value(race_summary.get("state"), get_profile_state(person))
    district = first_value(race_summary.get("district"), get_profile_district(person))

    fields = [
        make_field(
            "state",
            "State",
            classify_from_fields(has_content(state)),
            state,
            "Profile seed / race context / Google Civic",
            True,
            "race_opponent_context",
        ),
        make_field(
            "district",
            "District",
            classify_from_fields(has_content(district)),
            district,
            "Profile seed / race context / Google Civic",
            True,
            "race_opponent_context",
        ),
        make_field(
            "election_administration_body",
            "Election administration body",
            STATUS_SCAFFOLDED if has_content(state) else STATUS_EMPTY,
            "",
            "Google Civic / Secretary of State / state election office",
            False,
            "google_civic_election_runner_needed",
        ),
        make_field(
            "voter_registration_url",
            "Voter registration URL",
            STATUS_SCAFFOLDED if has_content(state) else STATUS_EMPTY,
            "",
            "Google Civic / state election office",
            False,
            "google_civic_election_runner_needed",
        ),
        make_field(
            "polling_place_lookup",
            "Polling place / voting location lookup",
            STATUS_SCAFFOLDED if has_content(state) else STATUS_EMPTY,
            "",
            "Google Civic / state election lookup",
            False,
            "google_civic_election_runner_needed",
        ),
        make_field(
            "district_map_layers",
            "District / precinct map layers",
            STATUS_EMPTY,
            "",
            "Census TIGER / state GIS / precinct shapefiles",
            False,
            "district_map_layer_runner_needed",
        ),
    ]

    return make_category("political_geography_electoral_venues", "Political Geography and Electoral Venues", fields, "State, district, election administration, voting links, and map layers.")


def build_fact_check_category() -> Dict[str, Any]:
    fields = [
        make_field(
            "fact_check_claims",
            "Fact-check claims",
            STATUS_EMPTY,
            "",
            "Google Fact Check Tools API / PolitiFact / FactCheck.org / manual review",
            False,
            "fact_check_runner_needed",
        ),
        make_field(
            "claim_subjects",
            "Claims made by or about profile",
            STATUS_EMPTY,
            "",
            "Fact-check sources and public mentions",
            False,
            "fact_check_runner_needed",
        ),
        make_field(
            "verification_status",
            "Claim verification status",
            STATUS_EMPTY,
            "",
            "Fact-check source metadata",
            False,
            "fact_check_runner_needed",
        ),
    ]

    return make_category("fact_check_index", "Fact Check Index", fields, "Verified third-party fact checks and claim tracking.")


def build_power_mapping_category() -> Dict[str, Any]:
    fields = [
        make_field(
            "staff_directory",
            "Staff directory",
            STATUS_EMPTY,
            "",
            "PolicyNote / official staff directories / manual source",
            False,
            "staff_network_runner_needed",
        ),
        make_field(
            "stakeholder_directory",
            "Stakeholder directory",
            STATUS_EMPTY,
            "",
            "PolicyNote / manual relationship records",
            False,
            "staff_network_runner_needed",
        ),
        make_field(
            "committee_gatekeepers",
            "Committee gatekeepers",
            STATUS_EMPTY,
            "",
            "Committee staff sources / PolicyNote / manual source",
            False,
            "staff_network_runner_needed",
        ),
        make_field(
            "relationship_notes",
            "Relationship notes",
            STATUS_EMPTY,
            "",
            "Internal CRM/manual relationship records",
            False,
            "relationship_notes_source_needed",
        ),
    ]

    return make_category("power_mapping_staff_networks", "Power Mapping and Staff Networks", fields, "Staff, stakeholders, committee gatekeepers, and relationship coverage.")


def build_source_coverage_category(coverage: Dict[str, Any]) -> Dict[str, Any]:
    rows = as_list(coverage.get("coverage_rows"))
    status_counts = as_dict(coverage.get("status_counts"))

    fields = [
        make_field(
            "coverage_matrix",
            "Coverage matrix",
            classify_from_fields(has_content(rows)),
            len(rows),
            "Source coverage matrix",
            True,
            "coverage_matrix",
        ),
        make_field(
            "completion_score",
            "Coverage completion score",
            classify_from_fields(has_content(coverage.get("completion_score"))),
            coverage.get("completion_score"),
            "Source coverage matrix",
            True,
            "coverage_matrix",
        ),
        make_field(
            "missing_runs",
            "Missing source runs",
            STATUS_PARTIAL if safe_int(status_counts.get("missing")) > 0 else STATUS_POPULATED,
            status_counts.get("missing", 0),
            "Run available source runners",
            True,
            "available_runner_execution",
        ),
        make_field(
            "warnings",
            "Source warnings",
            STATUS_PARTIAL if safe_int(status_counts.get("complete_with_warnings")) > 0 else STATUS_POPULATED,
            status_counts.get("complete_with_warnings", 0),
            "Review warning modules",
            True,
            "warning_review",
        ),
    ]

    return make_category("source_coverage", "Source Coverage", fields, "Source-run status and coverage matrix health.")


def build_profile_hydration_audit(
    profile_id: str,
    person: Dict[str, Any],
    latest_runs: List[Dict[str, Any]],
    coverage: Dict[str, Any],
) -> Dict[str, Any]:
    runs_by_module = latest_run_by_module(latest_runs)

    categories = [
        build_core_identity_category(person),
        build_biographical_category(person),
        build_official_web_category(runs_by_module),
        build_finance_category(person, runs_by_module),
        build_race_context_category(person, runs_by_module),
        build_opposition_category(runs_by_module),
        build_legislative_category(person, runs_by_module),
        build_media_category(runs_by_module),
        build_geography_category(person, runs_by_module),
        build_fact_check_category(),
        build_power_mapping_category(),
        build_source_coverage_category(coverage),
    ]

    aggregate_counts = {
        STATUS_POPULATED: 0,
        STATUS_EMPTY: 0,
        STATUS_SCAFFOLDED: 0,
        STATUS_PARTIAL: 0,
        STATUS_NOT_APPLICABLE: 0,
    }

    for category in categories:
        counts = as_dict(category.get("status_counts"))
        for key in aggregate_counts:
            aggregate_counts[key] += safe_int(counts.get(key))

    applicable_total = (
        aggregate_counts[STATUS_POPULATED]
        + aggregate_counts[STATUS_EMPTY]
        + aggregate_counts[STATUS_SCAFFOLDED]
        + aggregate_counts[STATUS_PARTIAL]
    )

    hydration_score = round(
        (
            aggregate_counts[STATUS_POPULATED] * 1.0
            + aggregate_counts[STATUS_PARTIAL] * 0.55
            + aggregate_counts[STATUS_SCAFFOLDED] * 0.25
        )
        / applicable_total
        * 100
    ) if applicable_total else 0

    priority_gaps = []

    for category in categories:
        for field in as_list(category.get("fields")):
            if not isinstance(field, dict):
                continue

            if field.get("status") in {STATUS_EMPTY, STATUS_SCAFFOLDED, STATUS_PARTIAL}:
                priority_gaps.append(
                    {
                        "category": category.get("category"),
                        "category_label": category.get("label"),
                        "field": field.get("field"),
                        "label": field.get("label"),
                        "status": field.get("status"),
                        "source_needed": field.get("source_needed"),
                        "runner_available": field.get("runner_available"),
                        "recommended_next_runner": field.get("recommended_next_runner"),
                    }
                )

    priority_order = {
        "race_context": 0,
        "opposition_intelligence": 1,
        "campaign_finance": 2,
        "official_web_contact": 3,
        "media_public_attention": 4,
        "legislative_activity": 5,
        "political_geography_electoral_venues": 6,
        "fact_check_index": 7,
        "power_mapping_staff_networks": 8,
        "source_coverage": 9,
        "biographical_profile": 10,
        "core_identity": 11,
    }

    status_order = {
        STATUS_EMPTY: 0,
        STATUS_SCAFFOLDED: 1,
        STATUS_PARTIAL: 2,
    }

    priority_gaps.sort(
        key=lambda item: (
            priority_order.get(str(item.get("category")), 999),
            status_order.get(str(item.get("status")), 999),
            str(item.get("field", "")),
        )
    )

    available_runner_next_actions = [
        gap for gap in priority_gaps
        if gap.get("runner_available") is True and gap.get("recommended_next_runner")
    ]

    missing_pipe_next_actions = [
        gap for gap in priority_gaps
        if gap.get("runner_available") is False and gap.get("recommended_next_runner")
    ]

    return {
        "profile_id": profile_id,
        "profile_name": get_profile_name(person, profile_id),
        "generated_at": utc_now_iso(),
        "hydration_version": "v1.8A",
        "hydration_score": hydration_score,
        "status_counts": aggregate_counts,
        "profile_type": {
            "office_type": get_office_type(person),
            "is_federal_profile": is_federal_profile(person),
            "is_state_legislative_profile": is_state_legislative_profile(person),
            "state": get_profile_state(person),
            "district": get_profile_district(person),
            "fec_candidate_id": get_fec_candidate_id(person),
            "bioguide_id": get_bioguide_id(person),
        },
        "categories": categories,
        "priority_gaps": priority_gaps[:40],
        "available_runner_next_actions": available_runner_next_actions[:20],
        "missing_pipe_next_actions": missing_pipe_next_actions[:20],
        "recommended_focus": priority_gaps[0] if priority_gaps else {
            "status": STATUS_POPULATED,
            "label": "No immediate hydration gap identified.",
        },
    }


def build_all_profiles_hydration_audit(
    cached_people: List[Dict[str, Any]],
    latest_runs_loader: Callable[[str], List[Dict[str, Any]]],
    coverage_loader: Callable[[str, Dict[str, Any], List[Dict[str, Any]]], Dict[str, Any]],
) -> Dict[str, Any]:
    profiles = []

    for cached_person in cached_people:
        if not isinstance(cached_person, dict):
            continue

        profile_id = first_value(cached_person.get("profile_id"))
        if not profile_id:
            continue

        person = cached_person.get("source_json")
        if not isinstance(person, dict):
            person = {}

        person.setdefault("profile_id", profile_id)
        person.setdefault("displayName", cached_person.get("display_name"))

        latest_runs = latest_runs_loader(profile_id)
        coverage = coverage_loader(profile_id, person, latest_runs)
        profiles.append(build_profile_hydration_audit(profile_id, person, latest_runs, coverage))

    aggregate_counts = {
        STATUS_POPULATED: 0,
        STATUS_EMPTY: 0,
        STATUS_SCAFFOLDED: 0,
        STATUS_PARTIAL: 0,
        STATUS_NOT_APPLICABLE: 0,
    }

    for profile in profiles:
        counts = as_dict(profile.get("status_counts"))
        for key in aggregate_counts:
            aggregate_counts[key] += safe_int(counts.get(key))

    average_hydration_score = round(
        sum(safe_int(profile.get("hydration_score")) for profile in profiles) / len(profiles)
    ) if profiles else 0

    profiles.sort(key=lambda item: safe_int(item.get("hydration_score")), reverse=True)

    weakest_profiles = sorted(profiles, key=lambda item: safe_int(item.get("hydration_score")))[:10]

    return {
        "generated_at": utc_now_iso(),
        "hydration_version": "v1.8A",
        "profile_count": len(profiles),
        "average_hydration_score": average_hydration_score,
        "aggregate_status_counts": aggregate_counts,
        "profiles": profiles,
        "weakest_profiles": [
            {
                "profile_id": profile.get("profile_id"),
                "profile_name": profile.get("profile_name"),
                "hydration_score": profile.get("hydration_score"),
                "recommended_focus": profile.get("recommended_focus"),
            }
            for profile in weakest_profiles
        ],
    }