import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


CONGRESS_API_BASE = "https://api.congress.gov/v3"
DEFAULT_TIMEOUT_SECONDS = 25


class CongressProfileError(ValueError):
    pass


class CongressRequestError(RuntimeError):
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


def get_bioguide_id(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("bioguideId"),
        person.get("bioguide_id"),
        nested_value(person, "ids", "bioguideId"),
        nested_value(person, "identifiers", "bioguideId"),
        nested_value(person, "sourceIdentity", "bioguideId"),
        nested_value(person, "legislativeMechanics", "bioguideId"),
    )


def build_url(path: str, params: Dict[str, Any]) -> str:
    clean_path = path if path.startswith("/") else f"/{path}"

    cleaned_params = {
        key: value
        for key, value in params.items()
        if value is not None and str(value).strip() != ""
    }

    return f"{CONGRESS_API_BASE}{clean_path}?{urlencode(cleaned_params)}"


def fetch_congress_json(path: str, params: Dict[str, Any], timeout: int = DEFAULT_TIMEOUT_SECONDS) -> Dict[str, Any]:
    url = build_url(path, params)
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "MemberCommandCenter/1.6B",
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except HTTPError as error:
        try:
            body = error.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""

        raise CongressRequestError(
            f"Congress.gov request failed for {path} with HTTP {error.code}: {body[:240]}"
        ) from error
    except URLError as error:
        raise CongressRequestError(f"Congress.gov request failed for {path}: {error}") from error
    except json.JSONDecodeError as error:
        raise CongressRequestError(f"Congress.gov returned invalid JSON for {path}: {error}") from error


def safe_fetch(label: str, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    try:
        value = fetch_congress_json(path, params)
        return {
            "ok": True,
            "label": label,
            "path": path,
            "status": "ok",
            "value": value,
            "error": "",
        }
    except Exception as error:
        return {
            "ok": False,
            "label": label,
            "path": path,
            "status": "error",
            "value": None,
            "error": str(error),
        }


def get_member_detail(result: Dict[str, Any]) -> Dict[str, Any]:
    if not result.get("ok"):
        return {}

    value = result.get("value")
    if not isinstance(value, dict):
        return {}

    member = value.get("member")
    if isinstance(member, dict):
        return member

    return value


def get_legislation_list(result: Dict[str, Any], key: str) -> List[Dict[str, Any]]:
    if not result.get("ok"):
        return []

    value = result.get("value")
    if not isinstance(value, dict):
        return []

    rows = value.get(key)
    if isinstance(rows, list):
        return [item for item in rows if isinstance(item, dict)]

    results = value.get("results")
    if isinstance(results, list):
        return [item for item in results if isinstance(item, dict)]

    return []


def get_text(source: Optional[Dict[str, Any]], keys: List[str]) -> str:
    if not isinstance(source, dict):
        return ""

    for key in keys:
        value = source.get(key)

        if value is not None and str(value).strip() != "":
            return str(value).strip()

    return ""


def get_nested_text(source: Optional[Dict[str, Any]], path: List[str]) -> str:
    if not isinstance(source, dict):
        return ""

    current: Any = source

    for key in path:
        if not isinstance(current, dict):
            return ""
        current = current.get(key)

    if current is None:
        return ""

    return str(current).strip()


def get_bill_label(bill: Optional[Dict[str, Any]]) -> str:
    if not isinstance(bill, dict):
        return ""

    congress = get_text(bill, ["congress"])
    bill_type = get_text(bill, ["type", "billType"])
    number = get_text(bill, ["number", "billNumber"])
    title = get_text(bill, ["title"])

    prefix_parts = [part for part in [congress, bill_type.upper() if bill_type else "", number] if part]
    prefix = " ".join(prefix_parts)

    if prefix and title:
        return f"{prefix}: {title}"

    return title or prefix


def get_bill_latest_action_label(bill: Optional[Dict[str, Any]]) -> str:
    if not isinstance(bill, dict):
        return "Not returned"

    latest_action = bill.get("latestAction")

    if isinstance(latest_action, dict):
        action_date = get_text(latest_action, ["actionDate"])
        action_text = get_text(latest_action, ["text"])

        if action_date and action_text:
            return f"{action_date}: {action_text}"

        return action_text or action_date or "Not returned"

    return "Not returned"


def build_member_district_label(member: Dict[str, Any], person: Dict[str, Any]) -> str:
    state = get_text(member, ["state"]) or get_text(person, ["state", "stateCode"])
    district = get_text(member, ["district"]) or get_text(person, ["district", "districtLabel"])
    chamber = get_text(member, ["chamber"]) or get_text(person, ["chamber", "officeType"])

    parts = [part for part in [state, district, chamber] if part]
    return " / ".join(parts) if parts else "Not returned"


def parse_bill_reference(bill: Dict[str, Any], fallback_congress: str) -> Optional[Tuple[str, str, str]]:
    congress = get_text(bill, ["congress"]) or fallback_congress
    bill_type = get_text(bill, ["type", "billType"])
    number = get_text(bill, ["number", "billNumber"])

    if congress and bill_type and number:
        return congress, bill_type.lower(), number

    url = get_text(bill, ["url"])
    if not url:
        return None

    match = re.search(r"/bill/(\d+)/([a-zA-Z]+)/(\d+)", url)
    if not match:
        return None

    return match.group(1), match.group(2).lower(), match.group(3)


def enrich_latest_bills(
    api_key: str,
    congress: str,
    sponsored: List[Dict[str, Any]],
    cosponsored: List[Dict[str, Any]],
    enrich_limit: int = 3,
) -> Dict[str, Any]:
    enriched_rows: List[Dict[str, Any]] = []

    targets: List[Tuple[str, Dict[str, Any]]] = [
        *[("sponsored", bill) for bill in sponsored[:enrich_limit]],
        *[("cosponsored", bill) for bill in cosponsored[:enrich_limit]],
    ]

    for relationship_type, bill in targets:
        bill_reference = parse_bill_reference(bill, congress)

        if not bill_reference:
            enriched_rows.append(
                {
                    "relationship_type": relationship_type,
                    "bill": bill,
                    "detail": {},
                    "status": "skipped",
                    "error": "Could not parse bill reference.",
                }
            )
            continue

        bill_congress, bill_type, bill_number = bill_reference

        try:
            detail = fetch_congress_json(
                f"/bill/{bill_congress}/{bill_type}/{bill_number}",
                {
                    "api_key": api_key,
                    "format": "json",
                },
            )
            enriched_rows.append(
                {
                    "relationship_type": relationship_type,
                    "bill": bill,
                    "detail": detail,
                    "status": "ok",
                    "error": "",
                }
            )
        except Exception as error:
            enriched_rows.append(
                {
                    "relationship_type": relationship_type,
                    "bill": bill,
                    "detail": {},
                    "status": "error",
                    "error": str(error),
                }
            )

    successful = sum(1 for row in enriched_rows if row["status"] == "ok")

    return {
        "ok": successful == len(enriched_rows),
        "label": "Bill enrichment",
        "path": "/bill/{congress}/{type}/{number}",
        "status": "ok" if successful == len(enriched_rows) else "partial",
        "value": {"results": enriched_rows},
        "error": "" if successful == len(enriched_rows) else "One or more bill enrichments failed or were skipped.",
    }


def enriched_result_list(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    value = result.get("value")
    if not isinstance(value, dict):
        return []

    rows = value.get("results")
    if isinstance(rows, list):
        return [item for item in rows if isinstance(item, dict)]

    return []


def extract_policy_area(enriched_row: Dict[str, Any]) -> str:
    detail = enriched_row.get("detail")
    if not isinstance(detail, dict):
        return ""

    bill = detail.get("bill")
    if not isinstance(bill, dict):
        return ""

    policy_area = bill.get("policyArea")
    if isinstance(policy_area, dict):
        return get_text(policy_area, ["name"])

    return ""


def diagnostic_status(result: Dict[str, Any], list_key: Optional[str] = None) -> str:
    if result.get("status") == "skipped":
        return f"skipped: {result.get('error') or 'not requested'}"

    if result.get("ok"):
        if list_key:
            count = len(get_legislation_list(result, list_key))
            return f"ok: {count} result{'s' if count != 1 else ''}"

        if result.get("label") == "Member detail":
            return "ok"

        count = len(enriched_result_list(result))
        return f"ok: {count} result{'s' if count != 1 else ''}"

    return f"error: {result.get('error') or 'request failed'}"


def count_attempted(results: Dict[str, Dict[str, Any]]) -> int:
    return sum(1 for result in results.values() if result.get("status") != "skipped")


def count_successful(results: Dict[str, Dict[str, Any]]) -> int:
    return sum(1 for result in results.values() if result.get("status") in {"ok", "partial"} and result.get("ok"))


def determine_run_status(results: Dict[str, Dict[str, Any]]) -> str:
    required_keys = ["member_detail", "sponsored_legislation", "cosponsored_legislation"]
    required_ok = sum(1 for key in required_keys if results.get(key, {}).get("ok"))

    if required_ok == len(required_keys):
        return "completed"

    if required_ok > 0:
        return "partial"

    return "failed"


def trim_response(api_response: Optional[Dict[str, Any]], list_keys: List[str], max_results: int = 10) -> Dict[str, Any]:
    if not isinstance(api_response, dict):
        return {}

    trimmed: Dict[str, Any] = {}

    for key, value in api_response.items():
        if key in list_keys and isinstance(value, list):
            trimmed[key] = value[:max_results]
        elif key in {"pagination", "request"}:
            trimmed[key] = value
        elif key not in list_keys:
            trimmed[key] = value

    return trimmed


def trim_enriched_response(result: Dict[str, Any], max_results: int = 6) -> Dict[str, Any]:
    rows = enriched_result_list(result)

    return {
        "results": rows[:max_results],
        "count": len(rows),
        "status": result.get("status"),
        "error": result.get("error"),
    }


def build_summary(
    bioguide_id: str,
    congress: str,
    limit: int,
    person: Dict[str, Any],
    results: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    sponsored = get_legislation_list(results["sponsored_legislation"], "sponsoredLegislation")
    cosponsored = get_legislation_list(results["cosponsored_legislation"], "cosponsoredLegislation")
    member_detail = get_member_detail(results["member_detail"])
    enriched_bills = enriched_result_list(results["enriched_bills"])

    policy_areas = []
    for row in enriched_bills:
        policy_area = extract_policy_area(row)
        if policy_area and policy_area not in policy_areas:
            policy_areas.append(policy_area)

    latest_sponsored = sponsored[0] if sponsored else None
    latest_cosponsored = cosponsored[0] if cosponsored else None

    return {
        "bioguide_id": bioguide_id,
        "congress": congress,
        "limit": limit,
        "member_name": get_text(member_detail, ["directOrderName", "name", "invertedOrderName"])
        or get_text(person, ["displayName", "name", "fullName"]),
        "state_district": build_member_district_label(member_detail, person),
        "sponsored_returned": len(sponsored),
        "cosponsored_returned": len(cosponsored),
        "enriched_bills_returned": len(enriched_bills),
        "latest_sponsored_bill": get_bill_label(latest_sponsored) or "Not returned",
        "latest_cosponsored_bill": get_bill_label(latest_cosponsored) or "Not returned",
        "latest_sponsored_action": get_bill_latest_action_label(latest_sponsored),
        "latest_cosponsored_action": get_bill_latest_action_label(latest_cosponsored),
        "policy_areas_preview": policy_areas[:8],
        "sponsored_legislation": sponsored[:limit],
        "cosponsored_legislation": cosponsored[:limit],
        "enriched_bills": enriched_bills[:6],
    }


def build_diagnostics(results: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "member_detail_status": diagnostic_status(results["member_detail"]),
        "sponsored_legislation_status": diagnostic_status(results["sponsored_legislation"], "sponsoredLegislation"),
        "cosponsored_legislation_status": diagnostic_status(results["cosponsored_legislation"], "cosponsoredLegislation"),
        "enriched_bills_status": diagnostic_status(results["enriched_bills"]),
        "attempted_requests": count_attempted(results),
        "successful_requests": count_successful(results),
    }


def build_raw(results: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "member_detail": {
            "status": results["member_detail"].get("status"),
            "path": results["member_detail"].get("path"),
            "error": results["member_detail"].get("error"),
            "response": trim_response(results["member_detail"].get("value"), ["member"], 1),
        },
        "sponsored_legislation": {
            "status": results["sponsored_legislation"].get("status"),
            "path": results["sponsored_legislation"].get("path"),
            "error": results["sponsored_legislation"].get("error"),
            "response": trim_response(results["sponsored_legislation"].get("value"), ["sponsoredLegislation"], 10),
        },
        "cosponsored_legislation": {
            "status": results["cosponsored_legislation"].get("status"),
            "path": results["cosponsored_legislation"].get("path"),
            "error": results["cosponsored_legislation"].get("error"),
            "response": trim_response(results["cosponsored_legislation"].get("value"), ["cosponsoredLegislation"], 10),
        },
        "enriched_bills": {
            "status": results["enriched_bills"].get("status"),
            "path": results["enriched_bills"].get("path"),
            "error": results["enriched_bills"].get("error"),
            "response": trim_enriched_response(results["enriched_bills"], 6),
        },
    }


def build_congress_legislation_run_payload(
    profile_id: str,
    person: Dict[str, Any],
    api_key: str,
    congress: str = "119",
    limit: int = 10,
) -> Dict[str, Any]:
    clean_profile_id = str(profile_id or "").strip()
    clean_api_key = str(api_key or "").strip()
    clean_congress = str(congress or "119").strip() or "119"
    clean_limit = max(1, min(int(limit or 10), 50))

    if not clean_profile_id:
        raise CongressProfileError("profile_id is required.")

    if not clean_api_key:
        raise CongressProfileError("CONGRESS_API_KEY is required.")

    bioguide_id = get_bioguide_id(person)

    if not bioguide_id:
        raise CongressProfileError("This profile does not have a Bioguide ID.")

    common_params = {
        "api_key": clean_api_key,
        "format": "json",
    }

    results: Dict[str, Dict[str, Any]] = {
        "member_detail": safe_fetch(
            "Member detail",
            f"/member/{bioguide_id}",
            {
                **common_params,
            },
        ),
        "sponsored_legislation": safe_fetch(
            "Sponsored legislation",
            f"/member/{bioguide_id}/sponsored-legislation",
            {
                **common_params,
                "limit": str(clean_limit),
                "offset": "0",
            },
        ),
        "cosponsored_legislation": safe_fetch(
            "Cosponsored legislation",
            f"/member/{bioguide_id}/cosponsored-legislation",
            {
                **common_params,
                "limit": str(clean_limit),
                "offset": "0",
            },
        ),
    }

    sponsored = get_legislation_list(results["sponsored_legislation"], "sponsoredLegislation")
    cosponsored = get_legislation_list(results["cosponsored_legislation"], "cosponsoredLegislation")

    results["enriched_bills"] = enrich_latest_bills(
        api_key=clean_api_key,
        congress=clean_congress,
        sponsored=sponsored,
        cosponsored=cosponsored,
        enrich_limit=3,
    )

    started_at = utc_now_iso()
    completed_at = utc_now_iso()

    return {
        "run_id": f"congress_{clean_profile_id}_{clean_congress}_{uuid.uuid4().hex}",
        "profile_id": clean_profile_id,
        "module_name": "congress_legislation",
        "run_status": determine_run_status(results),
        "started_at": started_at,
        "completed_at": completed_at,
        "source_name": "Congress.gov",
        "source_url": CONGRESS_API_BASE,
        "summary": build_summary(
            bioguide_id=bioguide_id,
            congress=clean_congress,
            limit=clean_limit,
            person=person,
            results=results,
        ),
        "diagnostics": build_diagnostics(results),
        "raw": build_raw(results),
    }