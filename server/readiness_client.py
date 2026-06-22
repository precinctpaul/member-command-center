from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional


READINESS_VERSION = "v1.9A"

TIER_COMMAND_READY = "command_ready"
TIER_NEARLY_READY = "nearly_ready"
TIER_NEEDS_WORK = "needs_work"
TIER_SOURCE_POOR = "source_poor"
TIER_INSUFFICIENT_DATA = "insufficient_data"

STATUS_COMPLETE = "complete"
STATUS_PARTIAL = "partial"
STATUS_MISSING = "missing"
STATUS_SOURCE_POOR = "source_poor"
STATUS_NOT_APPLICABLE = "not_applicable"

PLACEHOLDER_VALUES = {
    "",
    "tbd",
    "to be determined",
    "unknown",
    "n/a",
    "na",
    "none",
    "null",
    "--",
    "-",
    "not populated yet",
    "not started",
    "source needed",
    "source required",
    "state source required",
    "parser required",
    "polling required",
    "polling/electoral source needed",
    "opponent/contrast source needed",
}

FRAMEWORKS = [
    {"key": "identity_profile", "label": "Identity & Profile", "weight": 18},
    {"key": "official_sources", "label": "Official Sources", "weight": 14},
    {"key": "finance", "label": "Finance", "weight": 12},
    {"key": "election_context", "label": "Election Context", "weight": 10},
    {"key": "district_map", "label": "District / Map Layer", "weight": 10},
    {"key": "legislative_activity", "label": "Legislative / Official Activity", "weight": 10},
    {"key": "opponent_contrast", "label": "Opponent / Contrast", "weight": 8},
    {"key": "polling_electoral", "label": "Polling / Electoral Strength", "weight": 8},
    {"key": "source_health", "label": "Source Health", "weight": 10},
]

GAP_PRIORITY = {
    "source_health": 0,
    "opponent_contrast": 1,
    "polling_electoral": 2,
    "election_context": 3,
    "finance": 4,
    "legislative_activity": 5,
    "district_map": 6,
    "official_sources": 7,
    "identity_profile": 8,
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def first_value(*values: Any) -> str:
    for value in values:
        if has_content(value):
            return str(value).strip()

    return ""


def safe_int(value: Any) -> int:
    try:
        if value is None or value == "":
            return 0
        return int(value)
    except (TypeError, ValueError):
        return 0


def has_content(value: Any) -> bool:
    if value is None:
        return False

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return False
        return text.lower() not in PLACEHOLDER_VALUES

    if isinstance(value, list):
        return any(has_content(item) for item in value)

    if isinstance(value, dict):
        return any(has_content(item) for item in value.values())

    return True


def source_text_looks_backed(value: Any) -> bool:
    if not has_content(value):
        return False

    text = str(value).strip().lower()
    if any(marker in text for marker in ["required", "needed", "not populated", "not started", "scaffold"]):
        return False

    return True


def nested_value(source: Dict[str, Any], *path: str) -> Any:
    current: Any = source

    for key in path:
        if not isinstance(current, dict):
            return ""
        current = current.get(key)

    return current if current is not None else ""


def get_summary(run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return as_dict(run.get("summary")) if isinstance(run, dict) else {}


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


def get_profile_group(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("rosterGroupName"),
        person.get("group"),
        person.get("category"),
        person.get("officeType"),
        person.get("jurisdiction"),
        nested_value(person, "sourceIdentity", "category"),
    )


def get_profile_title(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("title"),
        person.get("officeTitle"),
        person.get("currentOffice"),
        nested_value(person, "office", "title"),
        nested_value(person, "sourceIdentity", "title"),
    )


def get_profile_party(person: Dict[str, Any]) -> str:
    return first_value(person.get("party"), nested_value(person, "identity", "party"))


def get_profile_state(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("state"),
        person.get("stateCode"),
        nested_value(person, "office", "state"),
        nested_value(person, "sourceIdentity", "state"),
        nested_value(person, "sourceIdentity", "stateCode"),
        nested_value(person, "politicalGeography", "state"),
    ).upper()


def get_profile_district(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("district"),
        person.get("districtLabel"),
        nested_value(person, "office", "district"),
        nested_value(person, "sourceIdentity", "district"),
        nested_value(person, "sourceIdentity", "districtLabel"),
        nested_value(person, "politicalGeography", "district"),
    )


def get_fec_candidate_id(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("fecCandidateId"),
        nested_value(person, "ids", "fecCandidateId"),
        nested_value(person, "identifiers", "fecCandidateId"),
        nested_value(person, "sourceIdentity", "fecCandidateId"),
        nested_value(person, "campaignFinanceSnapshot", "fecCandidateId"),
    )


def get_fec_committee_id(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("fecCommitteeId"),
        person.get("fecPrincipalCommitteeId"),
        nested_value(person, "ids", "fecCommitteeId"),
        nested_value(person, "ids", "fecPrincipalCommitteeId"),
        nested_value(person, "sourceIdentity", "fecPrincipalCommitteeId"),
        nested_value(person, "campaignFinanceSnapshot", "fecPrincipalCommitteeId"),
    )


def get_bioguide_id(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("bioguideId"),
        person.get("bioguide_id"),
        nested_value(person, "ids", "bioguideId"),
        nested_value(person, "identifiers", "bioguideId"),
        nested_value(person, "sourceIdentity", "bioguideId"),
        nested_value(person, "legislativeMechanics", "bioguideId"),
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

    if "u.s. senator" in raw or "us senator" in raw or raw == "senator":
        return "federal_senate" if get_bioguide_id(person) or get_fec_candidate_id(person).upper().startswith("S") else "state_legislative"

    if "senate" in raw and ("state" in raw or "district" in raw):
        return "state_legislative"

    if "assembly" in raw or "delegate" in raw or "state rep" in raw:
        return "state_legislative"

    if "governor" in raw:
        return "governor"

    if "mayor" in raw:
        return "mayor"

    if "federal" in raw:
        return "federal"

    if "state" in raw:
        return "state"

    return raw or "unknown"


def is_federal_profile(person: Dict[str, Any]) -> bool:
    fec_candidate_id = get_fec_candidate_id(person).upper()
    if fec_candidate_id.startswith(("H", "S", "P")):
        return True
    if get_bioguide_id(person):
        return True
    return get_office_type(person) in {"federal", "federal_house", "federal_senate"}


def is_state_legislative_profile(person: Dict[str, Any]) -> bool:
    return get_office_type(person) == "state_legislative"


def is_elected_profile(person: Dict[str, Any]) -> bool:
    office_type = get_office_type(person)
    return is_federal_profile(person) or office_type in {"state", "state_legislative", "governor", "mayor"}


def make_framework(
    key: str,
    status: str,
    score: int,
    reason: str,
    recommended_action: str,
    evidence: Optional[List[str]] = None,
    is_applicable: bool = True,
) -> Dict[str, Any]:
    definition = next((item for item in FRAMEWORKS if item["key"] == key), {"label": key, "weight": 0})
    return {
        "key": key,
        "label": definition["label"],
        "status": status,
        "score": max(0, min(100, int(score or 0))),
        "weight": definition["weight"],
        "is_applicable": is_applicable,
        "reason": reason,
        "recommended_action": recommended_action,
        "evidence": evidence or [],
    }


def status_from_score(score: int) -> str:
    if score >= 85:
        return STATUS_COMPLETE
    if score > 0:
        return STATUS_PARTIAL
    return STATUS_MISSING


def build_identity_framework(person: Dict[str, Any]) -> Dict[str, Any]:
    checks = [
        ("name", get_profile_name(person)),
        ("title", get_profile_title(person)),
        ("party", get_profile_party(person)),
        ("state", get_profile_state(person)),
        ("district", get_profile_district(person)),
        ("bio", first_value(person.get("bio"), nested_value(person, "bio", "short"), nested_value(person, "bio", "standard"))),
        ("headshot", first_value(person.get("headshotUrl"), person.get("photoUrl"), nested_value(person, "headshot", "primaryUrl"))),
    ]
    populated = [label for label, value in checks if has_content(value)]
    score = round(len(populated) / len(checks) * 100)

    return make_framework(
        "identity_profile",
        status_from_score(score),
        score,
        "Core identity fields are populated." if score >= 85 else "Core identity has missing profile fields.",
        "Add missing identity, biography, or headshot fields.",
        populated,
    )


def build_official_sources_framework(person: Dict[str, Any], runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    official_links = as_dict(person.get("officialLinks"))
    source_tracking = [item for item in as_list(person.get("sourceTracking")) if isinstance(item, dict) and has_content(item)]
    run = runs_by_module.get("official_web_contact")
    summary = get_summary(run)

    evidence = []
    for label, value in [
        ("official website", first_value(official_links.get("officialWebsite"), summary.get("primary_official_url"))),
        ("campaign website", first_value(official_links.get("campaignWebsite"), summary.get("primary_campaign_url"))),
        ("contact source", first_value(official_links.get("contactForm"), summary.get("primary_contact_url"))),
    ]:
        if has_content(value):
            evidence.append(label)

    reachable_count = safe_int(summary.get("reachable_count") or summary.get("healthy_urls") or summary.get("working_urls"))
    if reachable_count > 0:
        evidence.append(f"{reachable_count} reachable URL(s)")

    if source_tracking:
        evidence.append(f"{len(source_tracking)} source tracking record(s)")

    score = min(100, len(evidence) * 25)
    if reachable_count > 0 and score >= 50:
        score = max(score, 80)

    return make_framework(
        "official_sources",
        status_from_score(score),
        score,
        "Official source coverage is usable." if score >= 85 else "Official source coverage is incomplete.",
        "Run or review official_web_contact and add official/contact source links.",
        evidence,
    )


def build_finance_framework(person: Dict[str, Any], runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    if not is_elected_profile(person):
        return make_framework("finance", STATUS_NOT_APPLICABLE, 0, "Profile is not clearly an elected or candidate profile.", "No finance action required.", [], False)

    run = runs_by_module.get("openfec_finance")
    summary = get_summary(run)
    snapshot = as_dict(person.get("campaignFinanceSnapshot"))
    deep_finance = as_dict(person.get("deepCampaignFinance"))
    is_federal = is_federal_profile(person)

    if is_federal:
        candidate_id = first_value(summary.get("candidate_id"), summary.get("fec_candidate_id"), get_fec_candidate_id(person))
        committee_id = first_value(summary.get("committee_id"), summary.get("fec_committee_id"), get_fec_committee_id(person))
        has_finance_number = any(
            has_content(first_value(summary.get(key), snapshot.get(key)))
            for key in ["cash_on_hand", "cash_on_hand_end_period", "total_receipts", "total_disbursements", "itemizedReceiptsReturned", "itemizedDisbursementsReturned"]
        )
        evidence = [item for item in [candidate_id and "FEC candidate ID", committee_id and "FEC committee ID", has_finance_number and "finance totals/filings"] if item]
        score = 100 if candidate_id and committee_id and has_finance_number else 65 if candidate_id or committee_id or has_finance_number else 0
        return make_framework(
            "finance",
            status_from_score(score),
            score,
            "Federal finance has source-backed identifiers and finance evidence." if score >= 85 else "Federal finance is missing IDs or current finance evidence.",
            "Run openfec_finance or add missing FEC candidate/committee source evidence.",
            evidence,
        )

    state_source = first_value(
        person.get("stateFinanceSourceUrl"),
        nested_value(person, "stateFinance", "sourceUrl"),
        deep_finance.get("sourceUrl"),
    )
    state_values = [
        person.get("stateCashOnHand"),
        person.get("stateReceipts"),
        person.get("stateDisbursements"),
        nested_value(person, "stateFinance", "cashOnHand"),
        nested_value(person, "stateFinance", "receipts"),
    ]
    if has_content(state_source) and any(has_content(value) for value in state_values):
        return make_framework("finance", STATUS_COMPLETE, 100, "State/local finance has source-backed values.", "Monitor state/local finance source freshness.", ["state/local finance source"])

    return make_framework(
        "finance",
        STATUS_MISSING,
        0,
        "State/local campaign finance is not wired to a source-backed record.",
        "Add state/local campaign finance source evidence.",
        [],
    )


def build_election_framework(person: Dict[str, Any], runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    race_context = as_dict(person.get("raceContext"))
    run = runs_by_module.get("race_opponent_context")
    summary = get_summary(run)

    source_backed = (
        summary.get("race_context_status") == "source_backed"
        or has_content(race_context.get("sourceUrl"))
        or source_text_looks_backed(race_context.get("electionRulesSource"))
    )
    scaffold = has_content(first_value(race_context.get("office"), race_context.get("district"), race_context.get("electionCycle"), person.get("reelectionYear"), summary.get("race_label")))
    evidence = []

    if has_content(summary.get("race_label")):
        evidence.append(str(summary.get("race_label")))
    if has_content(race_context.get("office")):
        evidence.append(str(race_context.get("office")))
    if has_content(first_value(race_context.get("district"), summary.get("district"))):
        evidence.append("district/race field")
    if source_backed:
        evidence.append("source-backed election context")

    score = 100 if source_backed and scaffold else 55 if scaffold else 0
    return make_framework(
        "election_context",
        status_from_score(score),
        score,
        "Election context is source-backed." if score >= 85 else "Election context is scaffolded or missing.",
        "Add source-backed election cycle, office, filing, and race context.",
        evidence,
    )


def build_district_map_framework(person: Dict[str, Any]) -> Dict[str, Any]:
    geography = as_dict(person.get("politicalGeography"))
    has_map_layer = any(
        has_content(value)
        for value in [
            person.get("mapLayerGeoJsonUrl"),
            person.get("mapLayerSourceUrl"),
            person.get("mapLayerName"),
            geography.get("mapLayerGeoJsonUrl"),
            geography.get("mapLayerSourceUrl"),
            geography.get("districtMapLayer"),
        ]
    )
    has_basic_geography = has_content(get_profile_state(person)) or has_content(get_profile_district(person)) or has_content(geography.get("district"))

    if has_map_layer:
        return make_framework("district_map", STATUS_COMPLETE, 100, "District/map source layer is mapped.", "Monitor district/map layer freshness.", ["map layer source"])

    if has_basic_geography:
        return make_framework(
            "district_map",
            STATUS_PARTIAL,
            45,
            "Basic geography exists, but no district/map layer is source-backed.",
            "Add district map layer or GIS source.",
            ["state/district scaffold"],
        )

    return make_framework("district_map", STATUS_MISSING, 0, "District and map layer are missing.", "Add state, district, and map source.", [])


def build_legislative_framework(person: Dict[str, Any], runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    congress_summary = get_summary(runs_by_module.get("congress_legislation"))
    openstates_summary = get_summary(runs_by_module.get("openstates_legislation"))
    legislative_mechanics = as_dict(person.get("legislativeMechanics"))
    federal = is_federal_profile(person)
    state_legislative = is_state_legislative_profile(person)

    if federal:
        has_id = has_content(first_value(congress_summary.get("bioguide_id"), get_bioguide_id(person)))
        has_activity = safe_int(congress_summary.get("sponsored_returned") or congress_summary.get("sponsored_count")) > 0 or safe_int(congress_summary.get("cosponsored_returned") or congress_summary.get("cosponsored_count")) > 0 or has_content(legislative_mechanics.get("sponsoredLegislationCount"))
        score = 100 if has_id and has_activity else 55 if has_id or has_activity else 0
        return make_framework(
            "legislative_activity",
            status_from_score(score),
            score,
            "Federal legislative activity is source-backed." if score >= 85 else "Federal legislative activity is missing or partial.",
            "Run congress_legislation or add source-backed legislative activity.",
            [item for item in [has_id and "Bioguide/Congress ID", has_activity and "legislation activity"] if item],
        )

    if state_legislative:
        has_id = has_content(openstates_summary.get("openstates_person_id")) or has_content(nested_value(person, "sourceIdentity", "openStatesPersonId"))
        has_activity = safe_int(openstates_summary.get("bills_returned")) > 0 or safe_int(openstates_summary.get("votes_returned")) > 0 or safe_int(openstates_summary.get("committees_returned")) > 0
        score = 100 if has_id and has_activity else 55 if has_id or has_activity else 0
        return make_framework(
            "legislative_activity",
            status_from_score(score),
            score,
            "State legislative activity is source-backed." if score >= 85 else "State legislative activity is missing or partial.",
            "Run openstates_legislation or add state legislative source evidence.",
            [item for item in [has_id and "OpenStates identity", has_activity and "state legislative activity"] if item],
        )

    official_activity = has_content(first_value(person.get("officialActivitySourceUrl"), person.get("pressReleaseSourceUrl"), nested_value(person, "officialActivity", "sourceUrl")))
    if official_activity:
        return make_framework("legislative_activity", STATUS_PARTIAL, 60, "Official activity source exists for a non-legislative profile.", "Add structured official activity records.", ["official activity source"])

    return make_framework(
        "legislative_activity",
        STATUS_NOT_APPLICABLE,
        0,
        "Profile is not a legislative office and no official activity source is mapped.",
        "No legislative action required unless official activity tracking is desired.",
        [],
        False,
    )


def get_actual_contrast_evidence(person: Dict[str, Any]) -> List[Dict[str, Any]]:
    containers = [
        person.get("contrastEvidenceRecords"),
        person.get("contrastEvidence"),
        nested_value(person, "opponentContrast", "contrastEvidenceRecords"),
        nested_value(person, "oppositionResearch", "contrastEvidenceRecords"),
    ]
    records: List[Dict[str, Any]] = []

    for container in containers:
        for item in as_list(container):
            if not isinstance(item, dict):
                continue

            category = first_value(item.get("evidenceCategory"), item.get("category"))
            verification = first_value(item.get("verificationStatus"), item.get("sourceStatus"))
            review = first_value(item.get("reviewStatus"), item.get("status"))
            has_source = has_content(first_value(item.get("sourceUrl"), item.get("url"))) and has_content(first_value(item.get("claim"), item.get("sourceSummary"), item.get("theme")))

            if category == "contrast_evidence" and verification == "source_backed" and review == "usable" and has_source:
                records.append(item)

    return records


def build_opponent_contrast_framework(person: Dict[str, Any], runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    summary = get_summary(runs_by_module.get("race_opponent_context"))
    actual_contrast_records = get_actual_contrast_evidence(person)
    source_backed_opponents = safe_int(summary.get("source_backed_opponent_count"))
    candidate_pool = safe_int(summary.get("candidate_pool_count"))
    opponent_status = first_value(summary.get("opponent_context_status"))

    if actual_contrast_records:
        return make_framework(
            "opponent_contrast",
            STATUS_COMPLETE,
            100,
            "Actual source-backed contrast evidence is mapped.",
            "Review contrast evidence for freshness and legal/research usability.",
            [f"{len(actual_contrast_records)} contrast evidence record(s)"],
        )

    if source_backed_opponents > 0 or opponent_status == "source_backed":
        return make_framework(
            "opponent_contrast",
            STATUS_PARTIAL,
            45,
            "Opponent identity is source-backed, but contrast intelligence is not complete.",
            "Add source-backed contrast evidence; FEC opponent identity alone is not contrast.",
            [f"{source_backed_opponents} source-backed opponent record(s)"],
        )

    if candidate_pool > 0:
        return make_framework(
            "opponent_contrast",
            STATUS_PARTIAL,
            25,
            "Candidate pool exists, but true opponent and contrast evidence are not verified.",
            "Verify true opponents and add contrast evidence sources.",
            [f"{candidate_pool} candidate pool record(s)"],
        )

    return make_framework(
        "opponent_contrast",
        STATUS_MISSING,
        0,
        "No source-backed opponent/contrast intelligence is available.",
        "Run race_opponent_context and add contrast evidence from usable sources.",
        [],
    )


def build_polling_electoral_framework(person: Dict[str, Any], runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    race_context = as_dict(person.get("raceContext"))
    summary = get_summary(runs_by_module.get("race_opponent_context"))
    polling_source = first_value(person.get("pollingSourceUrl"), nested_value(person, "polling", "sourceUrl"), nested_value(person, "pollingElectoral", "sourceUrl"))
    actual_polling = has_content(polling_source) and has_content(first_value(person.get("pollingAverage"), person.get("latestPollSummary"), nested_value(person, "polling", "pollingAverage")))
    rating_or_baseline = has_content(first_value(person.get("raceRating"), person.get("partisanBaseline"), person.get("electoralStrengthSummary"), nested_value(person, "pollingElectoral", "raceRating"), nested_value(person, "pollingElectoral", "partisanBaseline")))
    rating_source = has_content(first_value(person.get("raceRatingSourceUrl"), person.get("partisanBaselineSourceUrl"), nested_value(person, "pollingElectoral", "sourceUrl")))
    prior_result = has_content(first_value(person.get("priorElectionResult"), person.get("priorElectionMargin"), nested_value(person, "pollingElectoral", "priorElectionResult")))
    has_race_context = has_content(first_value(race_context.get("office"), race_context.get("district"), summary.get("race_label")))

    if actual_polling or (rating_or_baseline and rating_source):
        return make_framework(
            "polling_electoral",
            STATUS_COMPLETE,
            100,
            "Polling/electoral strength has current source-backed evidence.",
            "Monitor polling, ratings, and baseline freshness.",
            [item for item in [actual_polling and "polling source", rating_or_baseline and "rating/baseline source"] if item],
        )

    if rating_or_baseline or prior_result or has_race_context:
        evidence = []
        if rating_or_baseline:
            evidence.append("rating/baseline without source URL")
        if prior_result:
            evidence.append("prior result evidence")
        if has_race_context:
            evidence.append("race context")
        return make_framework(
            "polling_electoral",
            STATUS_PARTIAL,
            45 if rating_or_baseline or prior_result else 25,
            "Electoral context is partial; prior results or race context do not count as polling coverage.",
            "Add actual polling, race rating, partisan baseline, or current electoral context with a source.",
            evidence,
        )

    return make_framework(
        "polling_electoral",
        STATUS_MISSING,
        0,
        "No source-backed polling or electoral strength evidence is mapped.",
        "Add polling, race rating, partisan baseline, or current electoral source evidence.",
        [],
    )


def build_source_health_framework(coverage: Dict[str, Any], hydration_audit: Dict[str, Any], latest_runs: List[Dict[str, Any]], person: Dict[str, Any]) -> Dict[str, Any]:
    coverage_score = safe_int(coverage.get("completion_score"))
    status_counts = as_dict(coverage.get("status_counts"))
    missing_count = safe_int(status_counts.get("missing"))
    failed_count = safe_int(status_counts.get("failed"))
    partial_count = safe_int(status_counts.get("partial"))
    warning_count = safe_int(status_counts.get("complete_with_warnings"))
    source_tracking_count = len([item for item in as_list(person.get("sourceTracking")) if isinstance(item, dict) and has_content(item)])
    run_count = len([run for run in latest_runs if isinstance(run, dict)])

    evidence = []
    if coverage_score:
        evidence.append(f"coverage score {coverage_score}%")
    if run_count:
        evidence.append(f"{run_count} latest run(s)")
    if source_tracking_count:
        evidence.append(f"{source_tracking_count} source tracking record(s)")

    if failed_count > 0 or (coverage_score < 35 and missing_count >= 3 and run_count == 0):
        return make_framework(
            "source_health",
            STATUS_SOURCE_POOR,
            max(0, min(35, coverage_score)),
            "Source health is poor because source runs are failed or broadly missing.",
            "Repair failed runs or execute the missing source runners.",
            evidence,
        )

    if coverage_score >= 80 and missing_count <= 1 and failed_count == 0:
        return make_framework("source_health", STATUS_COMPLETE, coverage_score, "Source runner coverage is strong.", "Monitor source freshness.", evidence)

    if coverage_score > 0 or source_tracking_count > 0 or run_count > 0:
        score = max(45, coverage_score if coverage_score else 45)
        return make_framework(
            "source_health",
            STATUS_PARTIAL,
            score,
            "Source health is usable but incomplete.",
            "Run missing source runners and review warnings.",
            evidence + [f"{missing_count} missing, {partial_count} partial, {warning_count} warning"],
        )

    return make_framework(
        "source_health",
        STATUS_SOURCE_POOR,
        0,
        "No usable source-run evidence is available yet.",
        "Execute source runners or add source-backed records before relying on this profile.",
        evidence,
    )


def calculate_readiness_score(frameworks: List[Dict[str, Any]]) -> int:
    applicable = [item for item in frameworks if item.get("is_applicable") is not False]
    total_weight = sum(safe_int(item.get("weight")) for item in applicable)

    if total_weight <= 0:
        return 0

    raw = sum(safe_int(item.get("score")) * safe_int(item.get("weight")) for item in applicable) / total_weight
    return round(raw)


def apply_caps(score: int, frameworks: List[Dict[str, Any]]) -> int:
    by_key = {item.get("key"): item for item in frameworks}
    capped_score = score

    if by_key.get("source_health", {}).get("status") == STATUS_SOURCE_POOR:
        capped_score = min(capped_score, 55)

    if by_key.get("opponent_contrast", {}).get("status") != STATUS_COMPLETE:
        capped_score = min(capped_score, 84)

    if by_key.get("polling_electoral", {}).get("status") == STATUS_MISSING:
        capped_score = min(capped_score, 84)

    return capped_score


def get_tier(score: int, frameworks: List[Dict[str, Any]]) -> str:
    applicable = [item for item in frameworks if item.get("is_applicable") is not False]
    if len(applicable) <= 2:
        return TIER_INSUFFICIENT_DATA

    by_key = {item.get("key"): item for item in frameworks}
    if by_key.get("source_health", {}).get("status") == STATUS_SOURCE_POOR:
        return TIER_SOURCE_POOR

    blocking_statuses = [
        item.get("status")
        for item in applicable
        if item.get("key") in {"identity_profile", "official_sources", "finance", "election_context", "district_map", "legislative_activity", "opponent_contrast", "polling_electoral"}
    ]
    has_missing = any(status == STATUS_MISSING for status in blocking_statuses)
    has_partial = any(status == STATUS_PARTIAL for status in blocking_statuses)

    if score >= 85 and not has_missing and not has_partial:
        return TIER_COMMAND_READY
    if score >= 70 and not has_missing:
        return TIER_NEARLY_READY
    return TIER_NEEDS_WORK


def build_strategic_gaps(frameworks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    gaps = []

    for framework in frameworks:
        if framework.get("is_applicable") is False:
            continue
        if framework.get("status") not in {STATUS_MISSING, STATUS_PARTIAL, STATUS_SOURCE_POOR}:
            continue

        gaps.append(
            {
                "framework_key": framework.get("key"),
                "framework_label": framework.get("label"),
                "status": framework.get("status"),
                "score": framework.get("score"),
                "reason": framework.get("reason"),
                "recommended_action": framework.get("recommended_action"),
            }
        )

    gaps.sort(
        key=lambda item: (
            GAP_PRIORITY.get(str(item.get("framework_key")), 999),
            {"source_poor": 0, "missing": 1, "partial": 2}.get(str(item.get("status")), 9),
            safe_int(item.get("score")),
        )
    )
    return gaps


def summarize_source_health(coverage: Dict[str, Any], latest_runs: List[Dict[str, Any]], source_health: Dict[str, Any]) -> Dict[str, Any]:
    status_counts = as_dict(coverage.get("status_counts"))
    return {
        "status": source_health.get("status"),
        "score": source_health.get("score"),
        "coverage_completion_score": safe_int(coverage.get("completion_score")),
        "latest_run_count": len([run for run in latest_runs if isinstance(run, dict)]),
        "missing_count": safe_int(status_counts.get("missing")),
        "partial_count": safe_int(status_counts.get("partial")),
        "warning_count": safe_int(status_counts.get("complete_with_warnings")),
        "failed_count": safe_int(status_counts.get("failed")),
        "next_action": source_health.get("recommended_action"),
    }


def compact_profile(readiness: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "profile_id": readiness.get("profile_id"),
        "display_name": readiness.get("display_name"),
        "group": readiness.get("group"),
        "readiness_score": readiness.get("readiness_score"),
        "readiness_tier": readiness.get("readiness_tier"),
        "main_constraint": readiness.get("main_constraint"),
        "recommended_next_action": readiness.get("recommended_next_action"),
        "source_health_summary": readiness.get("source_health_summary"),
    }


def build_profile_readiness(
    profile_id: str,
    person: Dict[str, Any],
    latest_runs: List[Dict[str, Any]],
    coverage: Optional[Dict[str, Any]] = None,
    hydration_audit: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    runs_by_module = latest_run_by_module(latest_runs)
    coverage_data = coverage if isinstance(coverage, dict) else {}
    hydration_data = hydration_audit if isinstance(hydration_audit, dict) else {}

    frameworks = [
        build_identity_framework(person),
        build_official_sources_framework(person, runs_by_module),
        build_finance_framework(person, runs_by_module),
        build_election_framework(person, runs_by_module),
        build_district_map_framework(person),
        build_legislative_framework(person, runs_by_module),
        build_opponent_contrast_framework(person, runs_by_module),
        build_polling_electoral_framework(person, runs_by_module),
        build_source_health_framework(coverage_data, hydration_data, latest_runs, person),
    ]

    raw_score = calculate_readiness_score(frameworks)
    readiness_score = apply_caps(raw_score, frameworks)
    readiness_tier = get_tier(readiness_score, frameworks)
    strategic_gaps = build_strategic_gaps(frameworks)
    main_constraint = strategic_gaps[0] if strategic_gaps else {
        "framework_key": "",
        "framework_label": "No immediate readiness constraint",
        "status": STATUS_COMPLETE,
        "reason": "Applicable frameworks are complete.",
        "recommended_action": "Monitor source freshness.",
    }
    source_health = next((item for item in frameworks if item.get("key") == "source_health"), {})

    return {
        "profile_id": profile_id,
        "display_name": get_profile_name(person, profile_id),
        "profile_name": get_profile_name(person, profile_id),
        "group": get_profile_group(person),
        "generated_at": utc_now_iso(),
        "readiness_version": READINESS_VERSION,
        "readiness_score": readiness_score,
        "raw_readiness_score": raw_score,
        "readiness_tier": readiness_tier,
        "main_constraint": main_constraint,
        "framework_statuses": frameworks,
        "strategic_gaps": strategic_gaps,
        "recommended_next_action": main_constraint.get("recommended_action") or "Monitor source freshness.",
        "source_health_summary": summarize_source_health(coverage_data, latest_runs, source_health),
    }


def build_all_profiles_readiness(
    cached_people: List[Dict[str, Any]],
    latest_runs_loader: Callable[[str], List[Dict[str, Any]]],
    coverage_loader: Callable[[str, Dict[str, Any], List[Dict[str, Any]]], Dict[str, Any]],
    hydration_loader: Callable[[str, Dict[str, Any], List[Dict[str, Any]], Dict[str, Any]], Dict[str, Any]],
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
        person.setdefault("id", profile_id)
        person.setdefault("displayName", cached_person.get("display_name"))

        latest_runs = latest_runs_loader(profile_id)
        coverage = coverage_loader(profile_id, person, latest_runs)
        hydration = hydration_loader(profile_id, person, latest_runs, coverage)
        profiles.append(build_profile_readiness(profile_id, person, latest_runs, coverage, hydration))

    tier_counts = {
        TIER_COMMAND_READY: 0,
        TIER_NEARLY_READY: 0,
        TIER_NEEDS_WORK: 0,
        TIER_SOURCE_POOR: 0,
        TIER_INSUFFICIENT_DATA: 0,
    }

    for profile in profiles:
        tier = profile.get("readiness_tier")
        if tier in tier_counts:
            tier_counts[tier] += 1

    average_score = round(sum(safe_int(profile.get("readiness_score")) for profile in profiles) / len(profiles)) if profiles else 0
    profiles.sort(key=lambda item: (safe_int(item.get("readiness_score")), item.get("display_name", "")), reverse=True)

    gap_counts: Dict[str, Dict[str, Any]] = {}
    for profile in profiles:
        constraint = as_dict(profile.get("main_constraint"))
        key = first_value(constraint.get("framework_key"), "unknown")
        label = first_value(constraint.get("framework_label"), "Unknown")
        if key not in gap_counts:
            gap_counts[key] = {"framework_key": key, "framework_label": label, "affected_count": 0}
        if constraint.get("status") != STATUS_COMPLETE:
            gap_counts[key]["affected_count"] += 1

    top_source_gaps = sorted(
        [item for item in gap_counts.values() if safe_int(item.get("affected_count")) > 0],
        key=lambda item: (-safe_int(item.get("affected_count")), GAP_PRIORITY.get(str(item.get("framework_key")), 999)),
    )[:8]

    command_ready_profiles = [compact_profile(profile) for profile in profiles if profile.get("readiness_tier") == TIER_COMMAND_READY]
    nearly_ready_profiles = [compact_profile(profile) for profile in profiles if profile.get("readiness_tier") == TIER_NEARLY_READY]
    critical_gap_profiles = [
        compact_profile(profile)
        for profile in sorted(profiles, key=lambda item: safe_int(item.get("readiness_score")))
        if profile.get("readiness_tier") in {TIER_NEEDS_WORK, TIER_SOURCE_POOR, TIER_INSUFFICIENT_DATA}
    ][:15]

    return {
        "generated_at": utc_now_iso(),
        "readiness_version": READINESS_VERSION,
        "total_profiles": len(profiles),
        "tier_counts": tier_counts,
        "average_readiness_score": average_score,
        "command_ready_profiles": command_ready_profiles,
        "nearly_ready_profiles": nearly_ready_profiles,
        "critical_gap_profiles": critical_gap_profiles,
        "top_source_gaps": top_source_gaps,
        "profiles": [compact_profile(profile) for profile in profiles],
    }
