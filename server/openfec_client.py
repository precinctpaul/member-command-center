import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


OPENFEC_API_BASE = "https://api.open.fec.gov/v1"
DEFAULT_TIMEOUT_SECONDS = 25


class OpenFecProfileError(ValueError):
    pass


class OpenFecRequestError(RuntimeError):
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


def get_fec_ids(person: Dict[str, Any]) -> Dict[str, str]:
    return {
        "candidate_id": first_value(
            person.get("fecCandidateId"),
            nested_value(person, "ids", "fecCandidateId"),
            nested_value(person, "identifiers", "fecCandidateId"),
            nested_value(person, "sourceIdentity", "fecCandidateId"),
            nested_value(person, "campaignFinanceSnapshot", "fecCandidateId"),
        ),
        "committee_id": first_value(
            person.get("fecCommitteeId"),
            person.get("fecPrincipalCommitteeId"),
            nested_value(person, "ids", "fecCommitteeId"),
            nested_value(person, "ids", "fecPrincipalCommitteeId"),
            nested_value(person, "identifiers", "fecCommitteeId"),
            nested_value(person, "identifiers", "fecPrincipalCommitteeId"),
            nested_value(person, "sourceIdentity", "fecPrincipalCommitteeId"),
            nested_value(person, "campaignFinanceSnapshot", "fecPrincipalCommitteeId"),
        ),
    }


def build_url(path: str, params: Dict[str, Any]) -> str:
    clean_path = path if path.startswith("/") else f"/{path}"

    cleaned_params = {
        key: value
        for key, value in params.items()
        if value is not None and str(value).strip() != ""
    }

    return f"{OPENFEC_API_BASE}{clean_path}?{urlencode(cleaned_params)}"


def fetch_openfec_json(path: str, params: Dict[str, Any], timeout: int = DEFAULT_TIMEOUT_SECONDS) -> Dict[str, Any]:
    url = build_url(path, params)
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "MemberCommandCenter/1.6A",
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

        raise OpenFecRequestError(
            f"OpenFEC request failed for {path} with HTTP {error.code}: {body[:240]}"
        ) from error
    except URLError as error:
        raise OpenFecRequestError(f"OpenFEC request failed for {path}: {error}") from error
    except json.JSONDecodeError as error:
        raise OpenFecRequestError(f"OpenFEC returned invalid JSON for {path}: {error}") from error


def safe_fetch(label: str, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    try:
        value = fetch_openfec_json(path, params)
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


def skipped_result(label: str, path: str, reason: str) -> Dict[str, Any]:
    return {
        "ok": True,
        "label": label,
        "path": path,
        "status": "skipped",
        "value": None,
        "error": reason,
    }


def get_results(api_response: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(api_response, dict):
        return []

    results = api_response.get("results")

    if isinstance(results, list):
        return [item for item in results if isinstance(item, dict)]

    return []


def first_result(result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not result.get("ok"):
        return None

    rows = get_results(result.get("value"))

    if not rows:
        return None

    return rows[0]


def result_list(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not result.get("ok"):
        return []

    return get_results(result.get("value"))


def get_number(source: Optional[Dict[str, Any]], keys: List[str]) -> Optional[float]:
    if not isinstance(source, dict):
        return None

    for key in keys:
        value = source.get(key)

        if value is not None and str(value).strip() != "":
            try:
                return float(value)
            except ValueError:
                return None
            except TypeError:
                return None

    return None


def get_text(source: Optional[Dict[str, Any]], keys: List[str]) -> str:
    if not isinstance(source, dict):
        return ""

    for key in keys:
        value = source.get(key)

        if value is not None and str(value).strip() != "":
            return str(value).strip()

    return ""


def first_text_from_sources(sources: List[Optional[Dict[str, Any]]], keys: List[str]) -> str:
    for source in sources:
        value = get_text(source, keys)
        if value:
            return value

    return ""


def latest_filing_label(filings: List[Dict[str, Any]]) -> str:
    if not filings:
        return "No recent filing returned"

    filing = filings[0]
    report_type = get_text(filing, ["report_type", "form_type", "report_type_full"]) or "Filing"
    receipt_date = get_text(filing, ["receipt_date", "filing_date"]) or "date unknown"

    return f"{report_type}, {receipt_date}"


def trim_response(api_response: Optional[Dict[str, Any]], max_results: int = 5) -> Dict[str, Any]:
    if not isinstance(api_response, dict):
        return {}

    trimmed = {
        "api_version": api_response.get("api_version"),
        "pagination": api_response.get("pagination"),
        "results": get_results(api_response)[:max_results],
    }

    return trimmed


def diagnostic_status(result: Dict[str, Any]) -> str:
    if result.get("status") == "skipped":
        return f"skipped: {result.get('error') or 'not requested'}"

    if result.get("ok"):
        count = len(result_list(result))
        return f"ok: {count} result{'s' if count != 1 else ''}"

    return f"error: {result.get('error') or 'request failed'}"


def count_attempted(results: Dict[str, Dict[str, Any]]) -> int:
    return sum(1 for result in results.values() if result.get("status") != "skipped")


def count_successful(results: Dict[str, Dict[str, Any]]) -> int:
    return sum(1 for result in results.values() if result.get("status") == "ok" and result.get("ok"))


def determine_run_status(results: Dict[str, Dict[str, Any]]) -> str:
    attempted = count_attempted(results)
    successful = count_successful(results)

    if attempted == 0:
        return "failed"

    if successful == attempted:
        return "completed"

    if successful > 0:
        return "partial"

    return "failed"


def build_summary(ids: Dict[str, str], cycle: str, results: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    candidate_totals = first_result(results["candidate_totals"])
    committee_totals = first_result(results["committee_totals"])
    debts = result_list(results["debts"])
    loans = result_list(results["loans"])
    filings = result_list(results["filings"])

    candidate_receipts = get_number(candidate_totals, ["receipts", "total_receipts"])
    candidate_disbursements = get_number(candidate_totals, ["disbursements", "total_disbursements"])
    candidate_cash = get_number(
        candidate_totals,
        [
            "cash_on_hand_end_period",
            "cash_on_hand",
            "last_cash_on_hand_end_period",
        ],
    )

    committee_receipts = get_number(committee_totals, ["receipts", "total_receipts"])
    committee_disbursements = get_number(committee_totals, ["disbursements", "total_disbursements"])
    committee_cash = get_number(
        committee_totals,
        [
            "cash_on_hand_end_period",
            "cash_on_hand",
            "last_cash_on_hand_end_period",
        ],
    )
    committee_debt = get_number(
        committee_totals,
        [
            "debts_owed_by_committee",
            "debt_owed_by_committee",
            "last_debts_owed_by_committee",
        ],
    )

    return {
        "candidate_id": ids["candidate_id"],
        "committee_id": ids["committee_id"],
        "cycle": cycle,
        "total_receipts": committee_receipts if committee_receipts is not None else candidate_receipts,
        "total_disbursements": committee_disbursements if committee_disbursements is not None else candidate_disbursements,
        "cash_on_hand": committee_cash if committee_cash is not None else candidate_cash,
        "latest_filing": latest_filing_label(filings),
        "candidate_total_receipts": candidate_receipts,
        "candidate_total_disbursements": candidate_disbursements,
        "candidate_cash_on_hand": candidate_cash,
        "committee_total_receipts": committee_receipts,
        "committee_total_disbursements": committee_disbursements,
        "committee_cash_on_hand": committee_cash,
        "committee_debt": committee_debt,
        "coverage_end_date": first_text_from_sources(
            [committee_totals, candidate_totals],
            ["coverage_end_date", "coverage_end_date_full", "transaction_coverage_date"],
        ),
        "debt_records_returned": len(debts),
        "loan_records_returned": len(loans),
        "recent_filings_returned": len(filings),
        "recent_filings": filings[:5],
        "debt_preview": debts[:3],
        "loan_preview": loans[:3],
    }


def build_diagnostics(results: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "candidate_totals_status": diagnostic_status(results["candidate_totals"]),
        "committee_totals_status": diagnostic_status(results["committee_totals"]),
        "debts_status": diagnostic_status(results["debts"]),
        "loans_status": diagnostic_status(results["loans"]),
        "filings_status": diagnostic_status(results["filings"]),
        "attempted_requests": count_attempted(results),
        "successful_requests": count_successful(results),
    }


def build_raw(results: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    raw: Dict[str, Any] = {}

    for key, result in results.items():
        raw[key] = {
            "status": result.get("status"),
            "path": result.get("path"),
            "error": result.get("error"),
            "response": trim_response(result.get("value")),
        }

    return raw


def build_openfec_finance_run_payload(
    profile_id: str,
    person: Dict[str, Any],
    api_key: str,
    cycle: str = "2026",
) -> Dict[str, Any]:
    clean_profile_id = str(profile_id or "").strip()
    clean_api_key = str(api_key or "").strip()
    clean_cycle = str(cycle or "2026").strip() or "2026"

    if not clean_profile_id:
        raise OpenFecProfileError("profile_id is required.")

    if not clean_api_key:
        raise OpenFecProfileError("FEC_API_KEY is required.")

    ids = get_fec_ids(person)

    if not ids["candidate_id"] and not ids["committee_id"]:
        raise OpenFecProfileError(
            "This profile does not have a FEC candidate ID or FEC committee ID."
        )

    common_params = {
        "api_key": clean_api_key,
        "cycle": clean_cycle,
        "per_page": "5",
    }

    results = {
        "candidate_totals": safe_fetch(
            "Candidate totals",
            f"/candidate/{ids['candidate_id']}/totals/",
            {
                **common_params,
                "sort": "-cycle",
            },
        )
        if ids["candidate_id"]
        else skipped_result("Candidate totals", "/candidate/{candidate_id}/totals/", "missing FEC candidate ID"),
        "committee_totals": safe_fetch(
            "Committee totals",
            f"/committee/{ids['committee_id']}/totals/",
            {
                **common_params,
                "sort": "-cycle",
            },
        )
        if ids["committee_id"]
        else skipped_result("Committee totals", "/committee/{committee_id}/totals/", "missing FEC committee ID"),
        "debts": safe_fetch(
            "Schedule D debts",
            "/schedules/schedule_d/",
            {
                **common_params,
                "committee_id": ids["committee_id"],
                "sort_hide_null": "false",
                "sort": "-report_year",
            },
        )
        if ids["committee_id"]
        else skipped_result("Schedule D debts", "/schedules/schedule_d/", "missing FEC committee ID"),
        "loans": safe_fetch(
            "Schedule C loans",
            "/schedules/schedule_c/",
            {
                **common_params,
                "committee_id": ids["committee_id"],
                "sort_hide_null": "false",
                "sort": "-incurred_date",
            },
        )
        if ids["committee_id"]
        else skipped_result("Schedule C loans", "/schedules/schedule_c/", "missing FEC committee ID"),
        "filings": safe_fetch(
            "Recent filings",
            "/filings/",
            {
                **common_params,
                "committee_id": ids["committee_id"],
                "sort": "-receipt_date",
            },
        )
        if ids["committee_id"]
        else skipped_result("Recent filings", "/filings/", "missing FEC committee ID"),
    }

    started_at = utc_now_iso()
    completed_at = utc_now_iso()

    return {
        "run_id": f"openfec_{clean_profile_id}_{clean_cycle}_{uuid.uuid4().hex}",
        "profile_id": clean_profile_id,
        "module_name": "openfec_finance",
        "run_status": determine_run_status(results),
        "started_at": started_at,
        "completed_at": completed_at,
        "source_name": "OpenFEC",
        "source_url": OPENFEC_API_BASE,
        "summary": build_summary(ids, clean_cycle, results),
        "diagnostics": build_diagnostics(results),
        "raw": build_raw(results),
    }