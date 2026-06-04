import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen


OPENSTATES_BASE = "https://v3.openstates.org"
DEFAULT_TIMEOUT_SECONDS = 25


class OpenStatesProfileError(ValueError):
    pass


class OpenStatesRequestError(RuntimeError):
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


def get_profile_name(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("displayName"),
        person.get("name"),
        person.get("fullName"),
        nested_value(person, "identity", "fullName"),
        nested_value(person, "sourceIdentity", "displayName"),
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


def state_code_from_jurisdiction(value: Any) -> str:
    if isinstance(value, dict):
        jurisdiction_id = first_value(value.get("id"))
        jurisdiction_name = first_value(value.get("name"))
    else:
        jurisdiction_id = first_value(value)
        jurisdiction_name = first_value(value)

    match = re.search(r"/state:([a-z]{2})/", jurisdiction_id.lower())
    if match:
        return match.group(1).upper()

    return get_state_code({"state": jurisdiction_name})


def get_jurisdiction_display(value: Any) -> str:
    if isinstance(value, dict):
        return first_value(value.get("name"), value.get("id"))

    return first_value(value)


def get_openstates_person_id(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("openstatesPersonId"),
        person.get("openStatesPersonId"),
        person.get("openstates_id"),
        person.get("openstatesId"),
        nested_value(person, "ids", "openstatesPersonId"),
        nested_value(person, "ids", "openStatesPersonId"),
        nested_value(person, "identifiers", "openstatesPersonId"),
        nested_value(person, "sourceIdentity", "openstatesPersonId"),
        nested_value(person, "sourceIdentity", "openStatesPersonId"),
    )


def get_district_hint(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("district"),
        person.get("districtLabel"),
        nested_value(person, "office", "district"),
        nested_value(person, "sourceIdentity", "district"),
    )


def get_chamber_hint(person: Dict[str, Any]) -> str:
    raw = first_value(
        person.get("chamber"),
        person.get("officeChamber"),
        person.get("officeType"),
        person.get("title"),
        nested_value(person, "office", "chamber"),
        nested_value(person, "office", "title"),
    ).lower()

    if "senate" in raw or "senator" in raw:
        return "upper"

    if "house" in raw or "representative" in raw or "assembly" in raw or "delegate" in raw:
        return "lower"

    return ""


def sanitize_url(url: str) -> str:
    parsed = urlparse(url)
    safe_query = []

    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if key.lower() in {"apikey", "api_key", "key", "token", "access_token"}:
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


def openstates_get(path: str, api_key: str, params: Optional[Dict[str, Any]] = None) -> Tuple[Dict[str, Any], str]:
    query: Dict[str, Any] = {}

    if params:
        for key, value in params.items():
            if value is None:
                continue

            if isinstance(value, str) and not value.strip():
                continue

            query[key] = value

    query["apikey"] = api_key

    url = f"{OPENSTATES_BASE}{path}?{urlencode(query, doseq=True)}"
    safe_url = sanitize_url(url)

    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "MemberCommandCenter/1.6H.1",
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8", errors="replace")
            return json.loads(body), safe_url
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise OpenStatesRequestError(f"{safe_url} failed with HTTP {error.code}: {body[:500]}") from error
    except URLError as error:
        raise OpenStatesRequestError(f"{safe_url} failed: {error}") from error
    except json.JSONDecodeError as error:
        raise OpenStatesRequestError(f"{safe_url} returned invalid JSON: {error}") from error


def get_result_list(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in ["results", "data", "items"]:
        value = payload.get(key)

        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    return []


def build_person_search_params(person: Dict[str, Any]) -> Dict[str, Any]:
    name = get_profile_name(person)
    state_code = get_state_code(person)

    if not name:
        raise OpenStatesProfileError("This profile does not have a searchable display name.")

    params: Dict[str, Any] = {
        "name": name,
        "per_page": 10,
        "include": ["offices", "other_names", "links", "sources"],
    }

    if state_code:
        params["jurisdiction"] = state_code.lower()

    return params


def normalize_links(value: Any) -> List[Dict[str, str]]:
    if not isinstance(value, list):
        return []

    links = []

    for item in value:
        if not isinstance(item, dict):
            continue

        links.append(
            {
                "url": first_value(item.get("url")),
                "note": first_value(item.get("note")),
            }
        )

    return links


def infer_role_chamber(role: Dict[str, Any]) -> str:
    combined = " ".join(
        [
            first_value(role.get("title")),
            first_value(role.get("name")),
            first_value(role.get("org_classification")),
        ]
    ).lower()

    if "senate" in combined or "upper" in combined:
        return "upper"

    if "house" in combined or "assembly" in combined or "lower" in combined:
        return "lower"

    return ""


def normalize_role(role: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "title": first_value(role.get("title"), role.get("name")),
        "org_classification": first_value(role.get("org_classification")),
        "district": first_value(role.get("district")),
        "division_id": first_value(role.get("division_id")),
        "jurisdiction": get_jurisdiction_display(role.get("jurisdiction")),
        "chamber": infer_role_chamber(role),
    }


def get_current_role(raw_person: Dict[str, Any]) -> Dict[str, Any]:
    roles = raw_person.get("current_role") or raw_person.get("current_roles")

    if isinstance(roles, dict):
        return normalize_role(roles)

    if isinstance(roles, list) and roles:
        for role in roles:
            if isinstance(role, dict):
                return normalize_role(role)

    offices = raw_person.get("offices")
    if isinstance(offices, list):
        for office in offices:
            if isinstance(office, dict):
                return normalize_role(office)

    return {}


def normalize_openstates_person(raw_person: Dict[str, Any]) -> Dict[str, Any]:
    current_role = get_current_role(raw_person)
    raw_jurisdiction = raw_person.get("jurisdiction")
    jurisdiction_code = state_code_from_jurisdiction(raw_jurisdiction)

    return {
        "id": first_value(raw_person.get("id"), raw_person.get("openstates_url")),
        "name": first_value(raw_person.get("name"), raw_person.get("sort_name")),
        "party": first_value(raw_person.get("party")),
        "current_role": current_role,
        "jurisdiction": get_jurisdiction_display(raw_jurisdiction),
        "jurisdiction_code": jurisdiction_code,
        "openstates_url": first_value(raw_person.get("openstates_url")),
        "image": first_value(raw_person.get("image")),
        "email": first_value(raw_person.get("email")),
        "extras": raw_person.get("extras") if isinstance(raw_person.get("extras"), dict) else {},
        "links": normalize_links(raw_person.get("links")),
        "sources": normalize_links(raw_person.get("sources")),
    }


def score_person_match(raw_person: Dict[str, Any], target_name: str, state_code: str, district_hint: str, chamber_hint: str) -> int:
    score = 0
    name = normalize_spaces(raw_person.get("name")).lower()
    target = normalize_spaces(target_name).lower()

    if name == target:
        score += 50
    elif target and target in name:
        score += 30

    person_state_code = state_code_from_jurisdiction(raw_person.get("jurisdiction"))
    if state_code and person_state_code and state_code.lower() == person_state_code.lower():
        score += 20

    role = get_current_role(raw_person)
    district = first_value(role.get("district"))
    chamber = first_value(role.get("chamber"))

    if district_hint and district and normalize_spaces(district).lower() in normalize_spaces(district_hint).lower():
        score += 10

    if chamber_hint and chamber_hint == chamber:
        score += 10

    if raw_person.get("openstates_url"):
        score += 3

    return score


def find_best_person(person: Dict[str, Any], api_key: str) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any], List[str]]:
    diagnostics = {
        "person_lookup_strategy": "",
        "person_search_count": 0,
        "selected_person_score": 0,
    }
    request_urls = []

    openstates_person_id = get_openstates_person_id(person)

    if openstates_person_id:
        diagnostics["person_lookup_strategy"] = "direct_openstates_person_id"
        payload, url = openstates_get(
            f"/people/{openstates_person_id}",
            api_key=api_key,
            params={"include": ["offices", "other_names", "links", "sources"]},
        )
        request_urls.append(url)
        return payload if isinstance(payload, dict) else None, diagnostics, request_urls

    diagnostics["person_lookup_strategy"] = "name_search"
    search_params = build_person_search_params(person)
    payload, url = openstates_get("/people", api_key=api_key, params=search_params)
    request_urls.append(url)

    candidates = get_result_list(payload)
    diagnostics["person_search_count"] = len(candidates)

    if not candidates:
        return None, diagnostics, request_urls

    target_name = get_profile_name(person)
    state_code = get_state_code(person)
    district_hint = get_district_hint(person)
    chamber_hint = get_chamber_hint(person)

    scored = [
        (
            score_person_match(candidate, target_name, state_code, district_hint, chamber_hint),
            candidate,
        )
        for candidate in candidates
    ]
    scored.sort(key=lambda item: item[0], reverse=True)

    diagnostics["selected_person_score"] = scored[0][0]
    return scored[0][1], diagnostics, request_urls


def normalize_bills(raw_bills: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    bills = []

    for bill in raw_bills:
        bills.append(
            {
                "id": first_value(bill.get("id")),
                "identifier": first_value(bill.get("identifier")),
                "title": first_value(bill.get("title")),
                "classification": bill.get("classification") if isinstance(bill.get("classification"), list) else [],
                "subject": bill.get("subject") if isinstance(bill.get("subject"), list) else [],
                "from_organization": first_value(bill.get("from_organization")),
                "jurisdiction": get_jurisdiction_display(bill.get("jurisdiction")),
                "session": first_value(bill.get("session")),
                "updated_at": first_value(bill.get("updated_at")),
                "openstates_url": first_value(bill.get("openstates_url")),
                "latest_action": get_latest_action(bill),
            }
        )

    return bills


def get_latest_action(bill: Dict[str, Any]) -> Dict[str, str]:
    actions = bill.get("actions")

    if not isinstance(actions, list) or not actions:
        return {}

    latest = actions[-1]

    if not isinstance(latest, dict):
        return {}

    classification = latest.get("classification")

    return {
        "description": first_value(latest.get("description")),
        "date": first_value(latest.get("date")),
        "organization": first_value(latest.get("organization")),
        "classification": ", ".join(classification) if isinstance(classification, list) else first_value(classification),
    }


def fetch_bills_for_person(
    openstates_person_id: str,
    person_name: str,
    api_key: str,
    jurisdiction_code: str,
    limit: int,
) -> Tuple[List[Dict[str, Any]], List[str], List[str]]:
    request_urls = []
    errors = []
    bills: List[Dict[str, Any]] = []

    clean_jurisdiction = jurisdiction_code.lower()

    query_attempts = [
        {
            "q": person_name,
            "jurisdiction": clean_jurisdiction,
            "per_page": limit,
            "include": ["sponsorships", "abstracts", "actions"],
        },
        {
            "sponsor": openstates_person_id,
            "jurisdiction": clean_jurisdiction,
            "per_page": limit,
            "include": ["sponsorships", "abstracts", "actions"],
        },
        {
            "q": person_name,
            "per_page": limit,
            "include": ["sponsorships", "abstracts", "actions"],
        },
    ]

    for params in query_attempts:
        try:
            payload, url = openstates_get("/bills", api_key=api_key, params=params)
            request_urls.append(url)
            normalized = normalize_bills(get_result_list(payload))
            bills.extend(normalized)

            if bills:
                break
        except Exception as error:
            errors.append(str(error))

    return bills[:limit], request_urls, errors


def normalize_votes(raw_votes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    votes = []

    for vote in raw_votes:
        votes.append(
            {
                "id": first_value(vote.get("id")),
                "motion_text": first_value(vote.get("motion_text")),
                "motion_classification": vote.get("motion_classification") if isinstance(vote.get("motion_classification"), list) else [],
                "start_date": first_value(vote.get("start_date")),
                "result": first_value(vote.get("result")),
                "organization": first_value(vote.get("organization")),
                "bill": normalize_vote_bill(vote.get("bill")),
                "openstates_url": first_value(vote.get("openstates_url")),
            }
        )

    return votes


def normalize_vote_bill(value: Any) -> Dict[str, str]:
    if not isinstance(value, dict):
        return {}

    return {
        "id": first_value(value.get("id")),
        "identifier": first_value(value.get("identifier")),
        "title": first_value(value.get("title")),
    }


def fetch_votes_for_person(
    openstates_person_id: str,
    person_name: str,
    api_key: str,
    jurisdiction_code: str,
    limit: int,
) -> Tuple[List[Dict[str, Any]], List[str], List[str]]:
    request_urls = []
    errors = []
    votes: List[Dict[str, Any]] = []

    clean_jurisdiction = jurisdiction_code.lower()

    query_attempts = [
        {
            "q": person_name,
            "jurisdiction": clean_jurisdiction,
            "per_page": limit,
        },
        {
            "voter": openstates_person_id,
            "jurisdiction": clean_jurisdiction,
            "per_page": limit,
        },
    ]

    for params in query_attempts:
        try:
            payload, url = openstates_get("/votes", api_key=api_key, params=params)
            request_urls.append(url)
            normalized = normalize_votes(get_result_list(payload))
            votes.extend(normalized)

            if votes:
                break
        except Exception as error:
            errors.append(str(error))

    return votes[:limit], request_urls, errors


def normalize_org_members(value: Any) -> List[Dict[str, str]]:
    if not isinstance(value, list):
        return []

    members = []

    for item in value:
        if not isinstance(item, dict):
            continue

        person_value = item.get("person")
        person_id = ""

        if isinstance(person_value, dict):
            person_id = first_value(person_value.get("id"))

        members.append(
            {
                "name": first_value(item.get("name"), nested_value(item, "person", "name")),
                "person_id": first_value(item.get("person_id"), person_id),
                "role": first_value(item.get("role")),
            }
        )

    return members


def normalize_committees(raw_orgs: List[Dict[str, Any]], required_member_id: str = "") -> List[Dict[str, Any]]:
    committees = []

    for org in raw_orgs:
        members = org.get("members")
        normalized_members = normalize_org_members(members)

        if required_member_id:
            member_ids = {member.get("person_id") for member in normalized_members}
            if required_member_id not in member_ids:
                continue

        committees.append(
            {
                "id": first_value(org.get("id")),
                "name": first_value(org.get("name")),
                "classification": first_value(org.get("classification")),
                "parent_id": first_value(org.get("parent_id")),
                "jurisdiction": get_jurisdiction_display(org.get("jurisdiction")),
                "openstates_url": first_value(org.get("openstates_url")),
                "matched_memberships": normalized_members,
            }
        )

    return committees


def fetch_committees_for_person(
    openstates_person_id: str,
    api_key: str,
    jurisdiction_code: str,
    limit: int,
) -> Tuple[List[Dict[str, Any]], List[str], List[str]]:
    request_urls = []
    errors = []
    committees: List[Dict[str, Any]] = []

    clean_jurisdiction = jurisdiction_code.lower()

    query_attempts = [
        {
            "member": openstates_person_id,
            "jurisdiction": clean_jurisdiction,
            "per_page": limit,
            "classification": "committee",
            "include": ["members"],
        },
        {
            "jurisdiction": clean_jurisdiction,
            "per_page": limit,
            "classification": "committee",
            "include": ["members"],
        },
    ]

    for index, params in enumerate(query_attempts):
        try:
            payload, url = openstates_get("/organizations", api_key=api_key, params=params)
            request_urls.append(url)
            normalized = normalize_committees(
                get_result_list(payload),
                openstates_person_id if index == 1 else "",
            )
            committees.extend(normalized)

            if committees:
                break
        except Exception as error:
            errors.append(str(error))

    return committees[:limit], request_urls, errors


def determine_run_status(
    person_found: bool,
    request_errors: List[str],
    bills: List[Dict[str, Any]],
    votes: List[Dict[str, Any]],
    committees: List[Dict[str, Any]],
) -> str:
    if not person_found:
        return "failed"

    if bills or votes or committees:
        return "completed"

    if request_errors:
        return "partial"

    return "partial"


def build_summary(
    selected_person: Dict[str, Any],
    bills: List[Dict[str, Any]],
    votes: List[Dict[str, Any]],
    committees: List[Dict[str, Any]],
    request_errors: List[str],
) -> Dict[str, Any]:
    normalized_person = normalize_openstates_person(selected_person)
    role = normalized_person.get("current_role") if isinstance(normalized_person.get("current_role"), dict) else {}

    return {
        "openstates_person_id": normalized_person.get("id"),
        "openstates_url": normalized_person.get("openstates_url"),
        "name": normalized_person.get("name"),
        "party": normalized_person.get("party"),
        "jurisdiction": normalized_person.get("jurisdiction"),
        "jurisdiction_code": normalized_person.get("jurisdiction_code"),
        "current_office": role.get("title"),
        "district": role.get("district"),
        "chamber": role.get("chamber"),
        "image": normalized_person.get("image"),
        "email": normalized_person.get("email"),
        "links": normalized_person.get("links"),
        "sources": normalized_person.get("sources"),
        "bills_returned": len(bills),
        "votes_returned": len(votes),
        "committees_returned": len(committees),
        "request_error_count": len(request_errors),
        "recent_bills": bills,
        "recent_votes": votes,
        "committee_memberships": committees,
    }


def build_diagnostics(
    lookup_diagnostics: Dict[str, Any],
    request_urls: List[str],
    request_errors: List[str],
    selected_person: Optional[Dict[str, Any]],
    bills: List[Dict[str, Any]],
    votes: List[Dict[str, Any]],
    committees: List[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        **lookup_diagnostics,
        "request_urls": request_urls,
        "request_error_count": len(request_errors),
        "request_errors": request_errors,
        "person_found": selected_person is not None,
        "bills_returned": len(bills),
        "votes_returned": len(votes),
        "committees_returned": len(committees),
        "diagnostics_redacted": True,
    }


def build_raw(
    selected_person: Optional[Dict[str, Any]],
    bills: List[Dict[str, Any]],
    votes: List[Dict[str, Any]],
    committees: List[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "selected_person": selected_person,
        "bills": bills,
        "votes": votes,
        "committees": committees,
    }


def build_openstates_legislation_run_payload(
    profile_id: str,
    person: Dict[str, Any],
    api_key: str,
    bill_limit: int = 10,
    vote_limit: int = 10,
    committee_limit: int = 10,
) -> Dict[str, Any]:
    clean_profile_id = str(profile_id or "").strip()
    clean_api_key = str(api_key or "").strip()
    clean_bill_limit = max(1, min(int(bill_limit or 10), 50))
    clean_vote_limit = max(1, min(int(vote_limit or 10), 50))
    clean_committee_limit = max(1, min(int(committee_limit or 10), 50))

    if not clean_profile_id:
        raise OpenStatesProfileError("profile_id is required.")

    if not clean_api_key:
        raise OpenStatesProfileError("OPENSTATES_API_KEY is required.")

    started_at = utc_now_iso()
    request_urls: List[str] = []
    request_errors: List[str] = []

    selected_person, lookup_diagnostics, lookup_urls = find_best_person(person=person, api_key=clean_api_key)
    request_urls.extend(lookup_urls)

    if not selected_person:
        completed_at = utc_now_iso()
        return {
            "run_id": f"openstates_legislation_{clean_profile_id}_{uuid.uuid4().hex}",
            "profile_id": clean_profile_id,
            "module_name": "openstates_legislation",
            "run_status": "failed",
            "started_at": started_at,
            "completed_at": completed_at,
            "source_name": "OpenStates",
            "source_url": OPENSTATES_BASE,
            "summary": {
                "openstates_person_id": "",
                "openstates_url": "",
                "name": get_profile_name(person),
                "bills_returned": 0,
                "votes_returned": 0,
                "committees_returned": 0,
                "request_error_count": 0,
                "message": "No matching OpenStates person was found.",
            },
            "diagnostics": build_diagnostics(
                lookup_diagnostics=lookup_diagnostics,
                request_urls=request_urls,
                request_errors=request_errors,
                selected_person=None,
                bills=[],
                votes=[],
                committees=[],
            ),
            "raw": build_raw(None, [], [], []),
        }

    normalized_person = normalize_openstates_person(selected_person)
    selected_person_id = first_value(normalized_person.get("id"))
    selected_person_name = first_value(normalized_person.get("name"), get_profile_name(person))
    selected_jurisdiction_code = first_value(normalized_person.get("jurisdiction_code"), get_state_code(person)).lower()

    bills, bill_urls, bill_errors = fetch_bills_for_person(
        openstates_person_id=selected_person_id,
        person_name=selected_person_name,
        api_key=clean_api_key,
        jurisdiction_code=selected_jurisdiction_code,
        limit=clean_bill_limit,
    )
    request_urls.extend(bill_urls)
    request_errors.extend(bill_errors)

    votes, vote_urls, vote_errors = fetch_votes_for_person(
        openstates_person_id=selected_person_id,
        person_name=selected_person_name,
        api_key=clean_api_key,
        jurisdiction_code=selected_jurisdiction_code,
        limit=clean_vote_limit,
    )
    request_urls.extend(vote_urls)
    request_errors.extend(vote_errors)

    committees, committee_urls, committee_errors = fetch_committees_for_person(
        openstates_person_id=selected_person_id,
        api_key=clean_api_key,
        jurisdiction_code=selected_jurisdiction_code,
        limit=clean_committee_limit,
    )
    request_urls.extend(committee_urls)
    request_errors.extend(committee_errors)

    completed_at = utc_now_iso()

    return {
        "run_id": f"openstates_legislation_{clean_profile_id}_{uuid.uuid4().hex}",
        "profile_id": clean_profile_id,
        "module_name": "openstates_legislation",
        "run_status": determine_run_status(
            person_found=True,
            request_errors=request_errors,
            bills=bills,
            votes=votes,
            committees=committees,
        ),
        "started_at": started_at,
        "completed_at": completed_at,
        "source_name": "OpenStates",
        "source_url": OPENSTATES_BASE,
        "summary": build_summary(
            selected_person=selected_person,
            bills=bills,
            votes=votes,
            committees=committees,
            request_errors=request_errors,
        ),
        "diagnostics": build_diagnostics(
            lookup_diagnostics=lookup_diagnostics,
            request_urls=request_urls,
            request_errors=request_errors,
            selected_person=selected_person,
            bills=bills,
            votes=votes,
            committees=committees,
        ),
        "raw": build_raw(
            selected_person=selected_person,
            bills=bills,
            votes=votes,
            committees=committees,
        ),
    }