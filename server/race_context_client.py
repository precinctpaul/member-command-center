import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen


OPENFEC_BASE = "https://api.open.fec.gov/v1"
DEFAULT_TIMEOUT_SECONDS = 25
DEFAULT_ELECTION_CYCLE = "2026"


class RaceContextProfileError(ValueError):
    pass


class RaceContextRequestError(RuntimeError):
    pass


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


def normalize_spaces(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_name(value: Any) -> str:
    text = normalize_spaces(value).lower()
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def get_profile_name(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("displayName"),
        person.get("name"),
        person.get("fullName"),
        nested_value(person, "identity", "fullName"),
        nested_value(person, "sourceIdentity", "displayName"),
    )


def get_party(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("party"),
        nested_value(person, "identity", "party"),
        nested_value(person, "sourceIdentity", "party"),
    )


def get_state_code(person: Dict[str, Any]) -> str:
    raw = first_value(
        person.get("stateCode"),
        person.get("state"),
        nested_value(person, "office", "state"),
        nested_value(person, "sourceIdentity", "stateCode"),
        nested_value(person, "sourceIdentity", "state"),
    ).upper()

    if len(raw) == 2 and raw.isalpha():
        return raw

    state_name_to_code = {
        "ALABAMA": "AL",
        "ALASKA": "AK",
        "ARIZONA": "AZ",
        "ARKANSAS": "AR",
        "CALIFORNIA": "CA",
        "COLORADO": "CO",
        "CONNECTICUT": "CT",
        "DELAWARE": "DE",
        "FLORIDA": "FL",
        "GEORGIA": "GA",
        "HAWAII": "HI",
        "IDAHO": "ID",
        "ILLINOIS": "IL",
        "INDIANA": "IN",
        "IOWA": "IA",
        "KANSAS": "KS",
        "KENTUCKY": "KY",
        "LOUISIANA": "LA",
        "MAINE": "ME",
        "MARYLAND": "MD",
        "MASSACHUSETTS": "MA",
        "MICHIGAN": "MI",
        "MINNESOTA": "MN",
        "MISSISSIPPI": "MS",
        "MISSOURI": "MO",
        "MONTANA": "MT",
        "NEBRASKA": "NE",
        "NEVADA": "NV",
        "NEW HAMPSHIRE": "NH",
        "NEW JERSEY": "NJ",
        "NEW MEXICO": "NM",
        "NEW YORK": "NY",
        "NORTH CAROLINA": "NC",
        "NORTH DAKOTA": "ND",
        "OHIO": "OH",
        "OKLAHOMA": "OK",
        "OREGON": "OR",
        "PENNSYLVANIA": "PA",
        "RHODE ISLAND": "RI",
        "SOUTH CAROLINA": "SC",
        "SOUTH DAKOTA": "SD",
        "TENNESSEE": "TN",
        "TEXAS": "TX",
        "UTAH": "UT",
        "VERMONT": "VT",
        "VIRGINIA": "VA",
        "WASHINGTON": "WA",
        "WEST VIRGINIA": "WV",
        "WISCONSIN": "WI",
        "WYOMING": "WY",
        "DISTRICT OF COLUMBIA": "DC",
    }

    return state_name_to_code.get(raw, "")


def get_district_raw(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("district"),
        person.get("districtLabel"),
        nested_value(person, "office", "district"),
        nested_value(person, "sourceIdentity", "district"),
    )


def get_numeric_district(person: Dict[str, Any]) -> str:
    raw = get_district_raw(person)

    if not raw:
        return ""

    matches = re.findall(r"\d+", raw)

    if not matches:
        return ""

    number = int(matches[-1])
    return str(number)


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
        nested_value(person, "sourceIdentity", "fecCommitteeId"),
        nested_value(person, "sourceIdentity", "fecPrincipalCommitteeId"),
        nested_value(person, "campaignFinanceSnapshot", "fecPrincipalCommitteeId"),
    )


def get_office_type(person: Dict[str, Any]) -> str:
    raw = first_value(
        person.get("officeTypeNormalized"),
        person.get("officeType"),
        person.get("title"),
        nested_value(person, "office", "type"),
        nested_value(person, "office", "title"),
    ).lower()

    fec_candidate_id = get_fec_candidate_id(person).upper()
    district = get_numeric_district(person)

    if fec_candidate_id.startswith("H"):
        return "house"

    if fec_candidate_id.startswith("S"):
        return "senate"

    if fec_candidate_id.startswith("P"):
        return "president"

    # State legislative titles must be detected before generic "senator" or
    # "representative" checks. Otherwise profiles like "State Senator" are
    # incorrectly sent through the federal Senate OpenFEC race search.
    if (
        "state senator" in raw
        or "state senate" in raw
        or "state representative" in raw
        or "state rep" in raw
        or "assembly" in raw
        or "delegate" in raw
        or raw in {"state", "state_legislative"}
    ):
        return "state_legislative"

    if "mayor" in raw:
        return "mayor"

    if "governor" in raw:
        return "governor"

    if "senate" in raw or "senator" in raw:
        return "senate"

    if "house" in raw or "representative" in raw or "congress" in raw:
        return "house"

    if raw == "federal" and district:
        return "house"

    if raw == "federal":
        return "federal"

    return raw or "unknown"


def get_federal_office_code(person: Dict[str, Any]) -> str:
    fec_candidate_id = get_fec_candidate_id(person).upper()
    office_type = get_office_type(person)

    if fec_candidate_id.startswith("H"):
        return "H"

    if fec_candidate_id.startswith("S"):
        return "S"

    if fec_candidate_id.startswith("P"):
        return "P"

    if office_type == "senate":
        return "S"

    if office_type == "house":
        return "H"

    return ""


def get_incumbency_label(person: Dict[str, Any]) -> str:
    raw = first_value(
        person.get("incumbency"),
        person.get("incumbentStatus"),
        person.get("candidateStatus"),
        nested_value(person, "raceContext", "incumbency"),
        nested_value(person, "raceContext", "incumbentStatus"),
    ).lower()

    if "incumbent" in raw:
        return "incumbent"

    if "challenger" in raw:
        return "challenger"

    if "open" in raw:
        return "open_seat"

    return ""


def sanitize_url(url: str) -> str:
    parsed = urlparse(url)
    safe_query = []

    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if key.lower() in {"api_key", "apikey", "key", "token", "access_token"}:
            safe_query.append((key, "[redacted]"))
        else:
            safe_query.append((key, value))

    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            urlencode(safe_query, doseq=True),
            parsed.fragment,
        )
    )


def openfec_get(path: str, api_key: str, params: Optional[Dict[str, Any]] = None) -> Tuple[Dict[str, Any], str]:
    query: Dict[str, Any] = {}

    if params:
        for key, value in params.items():
            if value is None:
                continue

            if isinstance(value, str) and not value.strip():
                continue

            query[key] = value

    query["api_key"] = api_key

    url = f"{OPENFEC_BASE}{path}?{urlencode(query, doseq=True)}"
    safe_url = sanitize_url(url)

    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "MemberCommandCenter/1.6I.1",
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8", errors="replace")
            return json.loads(body), safe_url
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RaceContextRequestError(f"{safe_url} failed with HTTP {error.code}: {body[:500]}") from error
    except URLError as error:
        raise RaceContextRequestError(f"{safe_url} failed: {error}") from error
    except json.JSONDecodeError as error:
        raise RaceContextRequestError(f"{safe_url} returned invalid JSON: {error}") from error


def get_result_list(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    value = payload.get("results")

    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]

    return []


def normalize_fec_candidate(raw: Dict[str, Any]) -> Dict[str, Any]:
    candidate_id = first_value(raw.get("candidate_id"))
    name = first_value(raw.get("name"))
    office = first_value(raw.get("office"))
    state = first_value(raw.get("state"))
    district = first_value(raw.get("district"))
    party = first_value(raw.get("party_full"), raw.get("party"))
    incumbent_challenge = first_value(raw.get("incumbent_challenge_full"), raw.get("incumbent_challenge"))
    active_through = first_value(raw.get("active_through"))

    principal_committees = raw.get("principal_committees")
    committee_ids = []

    if isinstance(principal_committees, list):
        for committee in principal_committees:
            if isinstance(committee, dict):
                committee_id = first_value(committee.get("committee_id"))
                if committee_id:
                    committee_ids.append(committee_id)

    return {
        "candidate_id": candidate_id,
        "name": name,
        "party": party,
        "office": office,
        "state": state,
        "district": district,
        "incumbent_challenge": incumbent_challenge,
        "active_through": active_through,
        "has_raised_funds": bool(raw.get("has_raised_funds")),
        "candidate_status": first_value(raw.get("candidate_status")),
        "first_file_date": first_value(raw.get("first_file_date")),
        "last_file_date": first_value(raw.get("last_file_date")),
        "principal_committee_ids": committee_ids,
        "fec_url": f"https://www.fec.gov/data/candidate/{candidate_id}/" if candidate_id else "",
        "raw_candidate": raw,
    }


def candidate_matches_profile(candidate: Dict[str, Any], person: Dict[str, Any]) -> bool:
    profile_candidate_id = get_fec_candidate_id(person)
    profile_name = normalize_name(get_profile_name(person))
    candidate_id = first_value(candidate.get("candidate_id"))
    candidate_name = normalize_name(candidate.get("name"))

    if profile_candidate_id and candidate_id == profile_candidate_id:
        return True

    if profile_name and candidate_name:
        if profile_name == candidate_name:
            return True

        name_parts = [part for part in profile_name.split(" ") if len(part) > 1]
        if name_parts and all(part in candidate_name for part in name_parts):
            return True

    return False


def is_candidate_active_for_cycle(candidate: Dict[str, Any], cycle: str) -> bool:
    active_through = first_value(candidate.get("active_through"))

    if not active_through:
        return True

    try:
        return int(active_through) >= int(cycle)
    except ValueError:
        return True


def search_federal_candidates(person: Dict[str, Any], api_key: str, cycle: str, limit: int) -> Tuple[List[Dict[str, Any]], List[str], List[str]]:
    request_urls = []
    errors = []
    office_code = get_federal_office_code(person)
    state_code = get_state_code(person)
    district = get_numeric_district(person)

    if not office_code or not state_code:
        return [], request_urls, ["Federal candidate search skipped because office/state was unavailable."]

    params: Dict[str, Any] = {
        "office": office_code,
        "state": state_code,
        "election_year": cycle,
        "per_page": max(1, min(limit, 100)),
        "sort": "name",
    }

    if office_code == "H" and district:
        params["district"] = district.zfill(2)

    try:
        payload, url = openfec_get("/candidates/search/", api_key=api_key, params=params)
        request_urls.append(url)
        candidates = [normalize_fec_candidate(item) for item in get_result_list(payload)]
        candidates = [candidate for candidate in candidates if is_candidate_active_for_cycle(candidate, cycle)]
        return candidates, request_urls, errors
    except Exception as error:
        errors.append(str(error))
        return [], request_urls, errors


def identify_likely_self_candidate(candidates: List[Dict[str, Any]], person: Dict[str, Any]) -> Dict[str, Any]:
    for candidate in candidates:
        if candidate_matches_profile(candidate, person):
            return candidate

    return {}


def identify_potential_opponents(candidates: List[Dict[str, Any]], person: Dict[str, Any]) -> List[Dict[str, Any]]:
    profile_party = get_party(person).lower()
    self_candidate = identify_likely_self_candidate(candidates, person)
    self_candidate_id = first_value(self_candidate.get("candidate_id"))

    opponents = []

    for candidate in candidates:
        candidate_id = first_value(candidate.get("candidate_id"))

        if self_candidate_id and candidate_id == self_candidate_id:
            continue

        if candidate_matches_profile(candidate, person):
            continue

        candidate_party = first_value(candidate.get("party")).lower()
        opponent_type = "unknown"

        if profile_party and candidate_party:
            if "democrat" in profile_party and "republican" in candidate_party:
                opponent_type = "general_election_opponent"
            elif "republican" in profile_party and "democrat" in candidate_party:
                opponent_type = "general_election_opponent"
            elif "democratic" in candidate_party and "democrat" in profile_party:
                opponent_type = "primary_opponent"
            elif candidate_party == profile_party:
                opponent_type = "primary_opponent"
            else:
                opponent_type = "third_party_or_other_opponent"

        opponents.append(
            {
                **candidate,
                "opponent_type": opponent_type,
                "evidence_level": "source_backed_fec_candidate_search",
            }
        )

    return opponents


def build_race_label(person: Dict[str, Any], cycle: str) -> str:
    office_type = get_office_type(person)
    state_code = get_state_code(person)
    district = get_numeric_district(person)
    district_raw = get_district_raw(person)

    if office_type == "house" and state_code and district:
        return f"{cycle} {state_code}-{district.zfill(2)} U.S. House"

    if office_type == "senate" and state_code:
        return f"{cycle} {state_code} U.S. Senate"

    if district_raw:
        if state_code and district_raw.upper().startswith(state_code):
            return f"{cycle} {district_raw} race context"

        if state_code:
            return f"{cycle} {state_code} {district_raw} race context"

        return f"{cycle} {district_raw} race context"

    if state_code:
        return f"{cycle} {state_code} race context"

    return f"{cycle} race context"


def build_race_context(person: Dict[str, Any], cycle: str) -> Dict[str, Any]:
    office_type = get_office_type(person)
    state_code = get_state_code(person)
    district = get_numeric_district(person)
    district_raw = get_district_raw(person)
    federal_office_code = get_federal_office_code(person)
    is_federal_fec_supported = bool(federal_office_code and state_code)

    return {
        "cycle": cycle,
        "race_label": build_race_label(person, cycle),
        "profile_name": get_profile_name(person),
        "party": get_party(person),
        "office_type": office_type,
        "federal_office_code": federal_office_code,
        "state": state_code,
        "district": district,
        "district_label": district_raw,
        "incumbency": get_incumbency_label(person),
        "fec_candidate_id": get_fec_candidate_id(person),
        "fec_committee_id": get_fec_committee_id(person),
        "is_federal_fec_supported": is_federal_fec_supported,
    }


def build_next_actions(race_context: Dict[str, Any], opponents: List[Dict[str, Any]], request_errors: List[str]) -> List[str]:
    actions = []

    if not race_context.get("is_federal_fec_supported"):
        actions.append("Add state/local election filing source for this non-federal race.")

    if race_context.get("is_federal_fec_supported") and not opponents:
        actions.append("Verify whether FEC has declared opponents yet and add state election filing cross-check.")

    if opponents:
        actions.append("Review FEC-discovered opponent list and mark declared, potential, withdrawn, or false-positive.")

    if request_errors:
        actions.append("Review source errors before treating race context as complete.")

    actions.append("Add manual/state source confirmation for ballot filing status and race rating.")

    return actions


def build_risk_flags(race_context: Dict[str, Any], opponents: List[Dict[str, Any]], request_errors: List[str]) -> List[str]:
    flags = []

    if not race_context.get("state"):
        flags.append("missing_state")

    if race_context.get("office_type") == "house" and not race_context.get("district"):
        flags.append("missing_house_district")

    if not race_context.get("incumbency"):
        flags.append("missing_incumbency_status")

    if race_context.get("is_federal_fec_supported") and not opponents:
        flags.append("no_source_backed_opponents_found")

    if request_errors:
        flags.append("source_request_errors_present")

    return flags


def determine_run_status(
    race_context: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    opponents: List[Dict[str, Any]],
    request_errors: List[str],
) -> str:
    if race_context.get("is_federal_fec_supported") and candidates:
        return "completed"

    if race_context.get("profile_name") and race_context.get("state"):
        return "partial"

    if request_errors:
        return "partial"

    return "failed"


def build_summary(
    race_context: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    self_candidate: Dict[str, Any],
    opponents: List[Dict[str, Any]],
    request_errors: List[str],
) -> Dict[str, Any]:
    opponents_with_committee_ids = [
        opponent
        for opponent in opponents
        if isinstance(opponent.get("principal_committee_ids"), list)
        and len(opponent.get("principal_committee_ids")) > 0
    ]
    opponents_with_raised_funds = [
        opponent
        for opponent in opponents
        if opponent.get("has_raised_funds") is True
    ]

    primary_opponents = [
        opponent
        for opponent in opponents
        if opponent.get("opponent_type") == "primary_opponent"
    ]
    general_election_opponents = [
        opponent
        for opponent in opponents
        if opponent.get("opponent_type") == "general_election_opponent"
    ]
    third_party_or_other_opponents = [
        opponent
        for opponent in opponents
        if opponent.get("opponent_type") == "third_party_or_other_opponent"
    ]
    unknown_or_unclassified_opponents = [
        opponent
        for opponent in opponents
        if opponent.get("opponent_type") not in {
            "primary_opponent",
            "general_election_opponent",
            "third_party_or_other_opponent",
        }
    ]

    return {
        **race_context,
        "candidate_pool_count": len(candidates),
        "candidate_pool": candidates,
        "self_candidate": self_candidate,
        "source_backed_opponent_count": len(opponents),
        "source_backed_opponents": opponents,
        "opponent_baseline_info": [
            {
                "name": opponent.get("name", ""),
                "candidate_id": opponent.get("candidate_id", ""),
                "party": opponent.get("party", ""),
                "office": opponent.get("office", ""),
                "state": opponent.get("state", ""),
                "district": opponent.get("district", ""),
                "opponent_type": opponent.get("opponent_type", ""),
                "candidate_status": opponent.get("candidate_status", ""),
                "has_raised_funds": opponent.get("has_raised_funds"),
                "principal_committee_ids": opponent.get("principal_committee_ids", []),
                "fec_url": opponent.get("fec_url", ""),
                "evidence_level": opponent.get("evidence_level", ""),
            }
            for opponent in opponents
        ],
        "opponent_committee_id_count": len(opponents_with_committee_ids),
        "opponent_finance_flags_count": len(opponents_with_raised_funds),
        "opponents_with_committee_ids": opponents_with_committee_ids,
        "opponents_with_raised_funds": opponents_with_raised_funds,
        "primary_opponent_count": len(primary_opponents),
        "general_election_opponent_count": len(general_election_opponents),
        "third_party_or_other_opponent_count": len(third_party_or_other_opponents),
        "unknown_or_unclassified_opponent_count": len(unknown_or_unclassified_opponents),
        "race_context_status": "source_backed" if candidates else "profile_scaffold",
        "opponent_context_status": "source_backed" if opponents else "not_found_or_not_connected",
        "risk_flags": build_risk_flags(race_context, opponents, request_errors),
        "next_actions": build_next_actions(race_context, opponents, request_errors),
        "request_error_count": len(request_errors),
        "finance_note": "Candidate finance totals are intentionally handled by the OpenFEC finance runner, not the race context runner.",
    }


def build_diagnostics(
    request_urls: List[str],
    request_errors: List[str],
    candidates: List[Dict[str, Any]],
    opponents: List[Dict[str, Any]],
    cycle: str,
) -> Dict[str, Any]:
    return {
        "source_strategy": "openfec_candidate_search_plus_profile_race_scaffold",
        "cycle": cycle,
        "request_urls": request_urls,
        "request_error_count": len(request_errors),
        "request_errors": request_errors,
        "candidate_pool_count": len(candidates),
        "source_backed_opponent_count": len(opponents),
        "candidate_finance_enrichment": "disabled_use_openfec_finance_runner",
        "diagnostics_redacted": True,
    }


def build_raw(
    race_context: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    self_candidate: Dict[str, Any],
    opponents: List[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "race_context": race_context,
        "candidate_pool": candidates,
        "self_candidate": self_candidate,
        "source_backed_opponents": opponents,
    }


def build_race_opponent_context_run_payload(
    profile_id: str,
    person: Dict[str, Any],
    api_key: str,
    cycle: str = DEFAULT_ELECTION_CYCLE,
    candidate_limit: int = 50,
) -> Dict[str, Any]:
    clean_profile_id = str(profile_id or "").strip()
    clean_api_key = str(api_key or "").strip()
    clean_cycle = str(cycle or DEFAULT_ELECTION_CYCLE).strip() or DEFAULT_ELECTION_CYCLE
    clean_candidate_limit = max(1, min(int(candidate_limit or 50), 100))

    if not clean_profile_id:
        raise RaceContextProfileError("profile_id is required.")

    started_at = utc_now_iso()
    request_urls: List[str] = []
    request_errors: List[str] = []

    race_context = build_race_context(person, clean_cycle)
    candidates: List[Dict[str, Any]] = []

    if race_context.get("is_federal_fec_supported") and not clean_api_key:
        raise RaceContextProfileError("FEC_API_KEY is required for federal race/opponent context.")

    if race_context.get("is_federal_fec_supported"):
        candidate_results, candidate_urls, candidate_errors = search_federal_candidates(
            person=person,
            api_key=clean_api_key,
            cycle=clean_cycle,
            limit=clean_candidate_limit,
        )
        candidates.extend(candidate_results)
        request_urls.extend(candidate_urls)
        request_errors.extend(candidate_errors)

    self_candidate = identify_likely_self_candidate(candidates, person)
    opponents = identify_potential_opponents(candidates, person)

    completed_at = utc_now_iso()

    return {
        "run_id": f"race_opponent_context_{clean_profile_id}_{uuid.uuid4().hex}",
        "profile_id": clean_profile_id,
        "module_name": "race_opponent_context",
        "run_status": determine_run_status(
            race_context=race_context,
            candidates=candidates,
            opponents=opponents,
            request_errors=request_errors,
        ),
        "started_at": started_at,
        "completed_at": completed_at,
        "source_name": "OpenFEC + profile race scaffold",
        "source_url": OPENFEC_BASE,
        "summary": build_summary(
            race_context=race_context,
            candidates=candidates,
            self_candidate=self_candidate,
            opponents=opponents,
            request_errors=request_errors,
        ),
        "diagnostics": build_diagnostics(
            request_urls=request_urls,
            request_errors=request_errors,
            candidates=candidates,
            opponents=opponents,
            cycle=clean_cycle,
        ),
        "raw": build_raw(
            race_context=race_context,
            candidates=candidates,
            self_candidate=self_candidate,
            opponents=opponents,
        ),
    }