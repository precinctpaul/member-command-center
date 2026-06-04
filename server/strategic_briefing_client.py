from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


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


def safe_float(value: Any) -> Optional[float]:
    try:
        if value is None or value == "":
            return None

        return float(value)
    except (TypeError, ValueError):
        return None


def format_money(value: Any) -> str:
    number = safe_float(value)

    if number is None:
        return ""

    return f"${number:,.2f}"


def get_summary(run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not run:
        return {}

    summary = run.get("summary")

    return summary if isinstance(summary, dict) else {}


def get_diagnostics(run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not run:
        return {}

    diagnostics = run.get("diagnostics")

    return diagnostics if isinstance(diagnostics, dict) else {}


def get_raw(run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not run:
        return {}

    raw = run.get("raw")

    return raw if isinstance(raw, dict) else {}


def latest_run_by_module(latest_runs: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    indexed: Dict[str, Dict[str, Any]] = {}

    for run in latest_runs:
        if not isinstance(run, dict):
            continue

        module_name = first_value(run.get("module_name"))

        if module_name:
            indexed[module_name] = run

    return indexed


def get_profile_name(person: Dict[str, Any], profile_id: str) -> str:
    return first_value(
        person.get("displayName"),
        person.get("name"),
        person.get("fullName"),
        profile_id,
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


def nested_value(source: Dict[str, Any], *path: str) -> str:
    current: Any = source

    for key in path:
        if not isinstance(current, dict):
            return ""

        current = current.get(key)

    if current is None:
        return ""

    return str(current).strip()


def source_line(run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not run:
        return {
            "source_name": "",
            "source_url": "",
            "run_id": "",
            "run_status": "",
            "completed_at": "",
        }

    return {
        "source_name": run.get("source_name", ""),
        "source_url": run.get("source_url", ""),
        "run_id": run.get("run_id", ""),
        "run_status": run.get("run_status", ""),
        "completed_at": run.get("completed_at", ""),
    }


def make_statement(text: str, module_name: str, run: Optional[Dict[str, Any]], fields: Optional[List[str]] = None) -> Dict[str, Any]:
    return {
        "text": text,
        "module_name": module_name,
        "source": source_line(run),
        "fields": fields or [],
    }


def first_value_list(*values: Any) -> List[Any]:
    for value in values:
        if isinstance(value, list):
            return value

    return []


def normalize_opponent_type(value: Any) -> str:
    text = str(value or "").strip().lower()

    if text == "primary_opponent":
        return "primary_opponent"

    if text == "general_election_opponent":
        return "general_election_opponent"

    if text == "third_party_or_other_opponent":
        return "third_party_or_other_opponent"

    return "unknown_or_unclassified_opponent"


def normalize_fec_candidate_status(value: Any) -> str:
    return str(value or "").strip().upper()


def get_opponent_principal_committee_ids(opponent: Dict[str, Any]) -> List[str]:
    committee_ids = opponent.get("principal_committee_ids")

    if isinstance(committee_ids, list):
        return [str(value).strip() for value in committee_ids if str(value).strip()]

    raw_candidate = opponent.get("raw_candidate")
    if isinstance(raw_candidate, dict):
        principal_committees = raw_candidate.get("principal_committees")

        if isinstance(principal_committees, list):
            extracted = []

            for committee in principal_committees:
                if not isinstance(committee, dict):
                    continue

                committee_id = first_value(committee.get("committee_id"))

                if committee_id:
                    extracted.append(committee_id)

            return extracted

    return []


def get_opponent_finance_snapshot(opponent: Dict[str, Any]) -> Dict[str, Any]:
    finance_totals = opponent.get("finance_totals")
    raw_candidate = opponent.get("raw_candidate")

    if not isinstance(finance_totals, dict):
        finance_totals = {}

    if not isinstance(raw_candidate, dict):
        raw_candidate = {}

    return {
        "has_raised_funds": opponent.get("has_raised_funds"),
        "candidate_status": first_value(opponent.get("candidate_status"), raw_candidate.get("candidate_status")),
        "principal_committee_ids": get_opponent_principal_committee_ids(opponent),
        "receipts": finance_totals.get("receipts"),
        "disbursements": finance_totals.get("disbursements"),
        "cash_on_hand_end_period": finance_totals.get("cash_on_hand_end_period"),
        "debts_owed_by_committee": finance_totals.get("debts_owed_by_committee"),
        "individual_contributions": finance_totals.get("individual_contributions"),
        "coverage_end_date": finance_totals.get("coverage_end_date", ""),
        "finance_enrichment_note": "Race context includes only candidate-discovery finance flags unless separate opponent finance runs are added.",
    }


def get_opponent_baseline(opponent: Dict[str, Any], race_summary: Dict[str, Any]) -> Dict[str, Any]:
    raw_candidate = opponent.get("raw_candidate")
    if not isinstance(raw_candidate, dict):
        raw_candidate = {}

    state = first_value(opponent.get("state"), raw_candidate.get("state"), race_summary.get("state"))
    district = first_value(opponent.get("district"), raw_candidate.get("district"), race_summary.get("district"))
    office = first_value(opponent.get("office"), raw_candidate.get("office"), race_summary.get("federal_office_code"), race_summary.get("office_type"))

    return {
        "name": first_value(opponent.get("name"), raw_candidate.get("name")),
        "title": first_value(opponent.get("title"), raw_candidate.get("office_full"), raw_candidate.get("office"), office),
        "office": office,
        "state": state,
        "district": district,
        "race_label": race_summary.get("race_label", ""),
        "reelection_year": race_summary.get("cycle", ""),
        "cycle": race_summary.get("cycle", ""),
        "party": first_value(opponent.get("party"), raw_candidate.get("party_full"), raw_candidate.get("party")),
        "candidate_id": first_value(opponent.get("candidate_id"), raw_candidate.get("candidate_id")),
        "candidate_status": first_value(opponent.get("candidate_status"), raw_candidate.get("candidate_status")),
        "opponent_type": normalize_opponent_type(opponent.get("opponent_type")),
        "incumbent_challenge": first_value(opponent.get("incumbent_challenge"), raw_candidate.get("incumbent_challenge_full"), raw_candidate.get("incumbent_challenge")),
        "first_file_date": first_value(opponent.get("first_file_date"), raw_candidate.get("first_file_date")),
        "last_file_date": first_value(opponent.get("last_file_date"), raw_candidate.get("last_file_date")),
        "active_through": first_value(opponent.get("active_through"), raw_candidate.get("active_through")),
        "headshot_url": first_value(opponent.get("headshot_url"), opponent.get("image"), raw_candidate.get("image")),
        "official_url": first_value(opponent.get("official_url"), opponent.get("website"), raw_candidate.get("candidate_url")),
        "campaign_url": first_value(opponent.get("campaign_url"), raw_candidate.get("candidate_url")),
        "fec_url": first_value(opponent.get("fec_url")),
        "evidence_level": first_value(opponent.get("evidence_level")),
        "finance": get_opponent_finance_snapshot(opponent),
    }


def segment_opponents(opponents: List[Dict[str, Any]], race_summary: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    segments = {
        "primary_opponents": [],
        "general_election_opponents": [],
        "third_party_or_other_opponents": [],
        "unknown_or_unclassified_opponents": [],
    }

    for opponent in opponents:
        if not isinstance(opponent, dict):
            continue

        baseline = get_opponent_baseline(opponent, race_summary)
        opponent_type = baseline.get("opponent_type")

        if opponent_type == "primary_opponent":
            segments["primary_opponents"].append(baseline)
        elif opponent_type == "general_election_opponent":
            segments["general_election_opponents"].append(baseline)
        elif opponent_type == "third_party_or_other_opponent":
            segments["third_party_or_other_opponents"].append(baseline)
        else:
            segments["unknown_or_unclassified_opponents"].append(baseline)

    return segments


def build_opposition_watch_items(opponents: List[Dict[str, Any]], race_summary: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    raised_funds = []
    active_status = []
    missing_principal_committee_ids = []

    for opponent in opponents:
        if not isinstance(opponent, dict):
            continue

        baseline = get_opponent_baseline(opponent, race_summary)
        finance = baseline.get("finance", {})
        candidate_status = normalize_fec_candidate_status(baseline.get("candidate_status"))
        principal_committee_ids = finance.get("principal_committee_ids") if isinstance(finance, dict) else []

        if baseline.get("finance", {}).get("has_raised_funds") is True:
            raised_funds.append(baseline)

        if candidate_status == "C":
            active_status.append(baseline)

        if not principal_committee_ids:
            missing_principal_committee_ids.append(baseline)

    return {
        "opponents_with_has_raised_funds_true": raised_funds,
        "opponents_with_candidate_status_c": active_status,
        "opponents_missing_principal_committee_ids": missing_principal_committee_ids,
    }


def build_overall_read(
    profile_id: str,
    person: Dict[str, Any],
    runs_by_module: Dict[str, Dict[str, Any]],
    coverage: Dict[str, Any],
) -> Dict[str, Any]:
    profile_name = get_profile_name(person, profile_id)
    available_modules = []
    warning_modules = []
    missing_modules = []

    coverage_rows = coverage.get("coverage_rows", [])

    if isinstance(coverage_rows, list):
        for row in coverage_rows:
            if not isinstance(row, dict):
                continue

            status = row.get("status")
            label = row.get("label") or row.get("module_name")

            if status == "complete":
                available_modules.append(label)
            elif status == "complete_with_warnings":
                available_modules.append(label)
                warning_modules.append(label)
            elif status in {"missing", "failed", "partial"}:
                missing_modules.append(label)

    statements = []

    if available_modules:
        statements.append(
            make_statement(
                f"{profile_name} has source-backed coverage available for: {', '.join(available_modules)}.",
                "source_coverage",
                None,
                ["coverage_rows"],
            )
        )
    else:
        statements.append(
            make_statement(
                f"{profile_name} does not yet have completed source coverage in the saved run set.",
                "source_coverage",
                None,
                ["coverage_rows"],
            )
        )

    race_run = runs_by_module.get("race_opponent_context")
    race_summary = get_summary(race_run)

    if race_summary.get("race_label"):
        statements.append(
            make_statement(
                f"Race context is available for {race_summary.get('race_label')}.",
                "race_opponent_context",
                race_run,
                ["race_label"],
            )
        )

    opponent_count = safe_int(race_summary.get("source_backed_opponent_count"))

    if opponent_count > 0:
        statements.append(
            make_statement(
                f"OpenFEC-backed race discovery currently returns {opponent_count} source-backed opponent record(s).",
                "race_opponent_context",
                race_run,
                ["source_backed_opponent_count"],
            )
        )

    if warning_modules:
        statements.append(
            make_statement(
                f"Usable coverage with warnings remains for: {', '.join(warning_modules)}.",
                "source_coverage",
                None,
                ["status"],
            )
        )

    return {
        "title": "Overall Read",
        "profile_name": profile_name,
        "completion_score": coverage.get("completion_score"),
        "status_counts": coverage.get("status_counts", {}),
        "statements": statements,
        "missing_or_partial_modules": missing_modules,
        "source_backed_only": True,
    }


def build_race_context_section(runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    run = runs_by_module.get("race_opponent_context")
    summary = get_summary(run)

    if not run:
        return {
            "title": "Political / Race Context",
            "status": "missing",
            "statements": [
                make_statement(
                    "Race and opponent context has not been run for this profile.",
                    "race_opponent_context",
                    None,
                    [],
                )
            ],
            "metrics": {},
            "opponents": [],
            "next_actions": ["Run race_opponent_context for this profile."],
        }

    opponents = summary.get("source_backed_opponents")
    if not isinstance(opponents, list):
        opponents = []

    opponent_briefs = []

    for opponent in opponents[:10]:
        if not isinstance(opponent, dict):
            continue

        opponent_briefs.append(get_opponent_baseline(opponent, summary))

    statements = []

    if summary.get("race_label"):
        statements.append(
            make_statement(
                f"Race: {summary.get('race_label')}.",
                "race_opponent_context",
                run,
                ["race_label"],
            )
        )

    if summary.get("is_federal_fec_supported"):
        statements.append(
            make_statement(
                "This is currently treated as a federal FEC-supported race context.",
                "race_opponent_context",
                run,
                ["is_federal_fec_supported"],
            )
        )
    else:
        statements.append(
            make_statement(
                "This race context is scaffolded from profile data only; state/local filing sources are not connected yet.",
                "race_opponent_context",
                run,
                ["is_federal_fec_supported", "race_context_status"],
            )
        )

    statements.append(
        make_statement(
            f"Candidate pool count: {safe_int(summary.get('candidate_pool_count'))}.",
            "race_opponent_context",
            run,
            ["candidate_pool_count"],
        )
    )

    statements.append(
        make_statement(
            f"Source-backed opponent records: {safe_int(summary.get('source_backed_opponent_count'))}.",
            "race_opponent_context",
            run,
            ["source_backed_opponent_count"],
        )
    )

    return {
        "title": "Political / Race Context",
        "status": summary.get("race_context_status", run.get("run_status", "")),
        "statements": statements,
        "metrics": {
            "cycle": summary.get("cycle", ""),
            "race_label": summary.get("race_label", ""),
            "office_type": summary.get("office_type", ""),
            "state": summary.get("state", ""),
            "district": summary.get("district", ""),
            "incumbency": summary.get("incumbency", ""),
            "is_federal_fec_supported": summary.get("is_federal_fec_supported"),
            "candidate_pool_count": summary.get("candidate_pool_count", 0),
            "source_backed_opponent_count": summary.get("source_backed_opponent_count", 0),
            "opponent_context_status": summary.get("opponent_context_status", ""),
        },
        "opponents": opponent_briefs,
        "next_actions": summary.get("next_actions", []),
        "source": source_line(run),
    }


def build_opposition_intelligence_section(runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    run = runs_by_module.get("race_opponent_context")
    summary = get_summary(run)

    if not run:
        return {
            "title": "Opponent / Opposition Intelligence",
            "status": "missing",
            "statements": [
                make_statement(
                    "Opponent intelligence is missing because race_opponent_context has not been run for this profile.",
                    "race_opponent_context",
                    None,
                    [],
                )
            ],
            "metrics": {
                "source_backed_opponent_count": 0,
                "primary_opponent_count": 0,
                "general_election_opponent_count": 0,
                "third_party_or_other_opponent_count": 0,
                "unknown_or_unclassified_opponent_count": 0,
                "raised_funds_opponent_count": 0,
                "candidate_status_c_count": 0,
                "candidate_pool_count": 0,
            },
            "baseline_opponent_information": [],
            "opponent_segments": {
                "primary_opponents": [],
                "general_election_opponents": [],
                "third_party_or_other_opponents": [],
                "unknown_or_unclassified_opponents": [],
            },
            "watch_items": {
                "opponents_with_has_raised_funds_true": [],
                "opponents_with_candidate_status_c": [],
                "opponents_missing_principal_committee_ids": [],
            },
            "next_actions": ["Run race_opponent_context for this profile."],
            "source": source_line(None),
        }

    opponents = summary.get("source_backed_opponents")
    if not isinstance(opponents, list):
        opponents = []

    baseline_opponents = [get_opponent_baseline(opponent, summary) for opponent in opponents if isinstance(opponent, dict)]
    segments = segment_opponents(opponents, summary)
    watch_items = build_opposition_watch_items(opponents, summary)

    source_backed_opponent_count = safe_int(summary.get("source_backed_opponent_count"))
    primary_count = len(segments["primary_opponents"])
    general_count = len(segments["general_election_opponents"])
    third_party_count = len(segments["third_party_or_other_opponents"])
    unknown_count = len(segments["unknown_or_unclassified_opponents"])
    raised_funds_count = len(watch_items["opponents_with_has_raised_funds_true"])
    candidate_status_c_count = len(watch_items["opponents_with_candidate_status_c"])

    if source_backed_opponent_count > 0:
        status = "source_backed"
    else:
        status = "scaffold_only"

    statements = []

    if source_backed_opponent_count > 0:
        statements.append(
            make_statement(
                f"Source-backed opponent records: {source_backed_opponent_count}.",
                "race_opponent_context",
                run,
                ["source_backed_opponent_count"],
            )
        )
        statements.append(
            make_statement(
                f"Primary opponent records: {primary_count}.",
                "race_opponent_context",
                run,
                ["source_backed_opponents", "opponent_type"],
            )
        )
        statements.append(
            make_statement(
                f"General election opponent records: {general_count}.",
                "race_opponent_context",
                run,
                ["source_backed_opponents", "opponent_type"],
            )
        )
        statements.append(
            make_statement(
                f"Third-party or other opponent records: {third_party_count}.",
                "race_opponent_context",
                run,
                ["source_backed_opponents", "opponent_type"],
            )
        )
        statements.append(
            make_statement(
                f"Raised-funds opponent records: {raised_funds_count}.",
                "race_opponent_context",
                run,
                ["source_backed_opponents", "has_raised_funds"],
            )
        )
    else:
        statements.append(
            make_statement(
                "No source-backed opponent records are currently available from race_opponent_context.",
                "race_opponent_context",
                run,
                ["source_backed_opponent_count"],
            )
        )

        if not summary.get("is_federal_fec_supported"):
            statements.append(
                make_statement(
                    "Opponent intelligence is scaffolded only because state/local filing sources are not connected for this profile.",
                    "race_opponent_context",
                    run,
                    ["is_federal_fec_supported", "race_context_status"],
                )
            )

    next_actions = [
        "Review FEC-discovered opponent list and mark declared, potential, withdrawn, or false-positive.",
        "Create opponent profiles for source-backed opponent records.",
        "Run finance/web/media checks for priority opponents.",
    ]

    if not summary.get("is_federal_fec_supported"):
        next_actions.append("Add state/local filing source for non-federal races.")

    return {
        "title": "Opponent / Opposition Intelligence",
        "status": status,
        "statements": statements,
        "metrics": {
            "source_backed_opponent_count": source_backed_opponent_count,
            "primary_opponent_count": primary_count,
            "general_election_opponent_count": general_count,
            "third_party_or_other_opponent_count": third_party_count,
            "unknown_or_unclassified_opponent_count": unknown_count,
            "raised_funds_opponent_count": raised_funds_count,
            "candidate_status_c_count": candidate_status_c_count,
            "candidate_pool_count": safe_int(summary.get("candidate_pool_count")),
            "race_label": summary.get("race_label", ""),
            "cycle": summary.get("cycle", ""),
            "state": summary.get("state", ""),
            "district": summary.get("district", ""),
        },
        "baseline_opponent_information": baseline_opponents,
        "opponent_segments": segments,
        "watch_items": watch_items,
        "next_actions": next_actions,
        "source": source_line(run),
    }


def build_money_position_section(runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    run = runs_by_module.get("openfec_finance")
    summary = get_summary(run)

    if not run:
        return {
            "title": "Money Position",
            "status": "missing",
            "statements": [
                make_statement(
                    "OpenFEC finance has not been run for this profile or is not applicable.",
                    "openfec_finance",
                    None,
                    [],
                )
            ],
            "metrics": {},
            "recent_filings": [],
            "warnings": [],
        }

    statements = []
    warnings = []

    cash = format_money(first_value(summary.get("cash_on_hand"), summary.get("committee_cash_on_hand"), summary.get("candidate_cash_on_hand")))
    receipts = format_money(first_value(summary.get("total_receipts"), summary.get("committee_total_receipts"), summary.get("candidate_total_receipts")))
    disbursements = format_money(first_value(summary.get("total_disbursements"), summary.get("committee_total_disbursements"), summary.get("candidate_total_disbursements")))
    debt = format_money(first_value(summary.get("committee_debt"), summary.get("debt")))

    if cash:
        statements.append(
            make_statement(
                f"Cash on hand: {cash}.",
                "openfec_finance",
                run,
                ["cash_on_hand", "committee_cash_on_hand", "candidate_cash_on_hand"],
            )
        )

    if receipts:
        statements.append(
            make_statement(
                f"Total receipts: {receipts}.",
                "openfec_finance",
                run,
                ["total_receipts", "committee_total_receipts", "candidate_total_receipts"],
            )
        )

    if disbursements:
        statements.append(
            make_statement(
                f"Total disbursements: {disbursements}.",
                "openfec_finance",
                run,
                ["total_disbursements", "committee_total_disbursements", "candidate_total_disbursements"],
            )
        )

    if debt:
        statements.append(
            make_statement(
                f"Committee debt: {debt}.",
                "openfec_finance",
                run,
                ["committee_debt", "debt"],
            )
        )

    if summary.get("coverage_end_date"):
        statements.append(
            make_statement(
                f"Finance coverage end date: {summary.get('coverage_end_date')}.",
                "openfec_finance",
                run,
                ["coverage_end_date"],
            )
        )

    diagnostics = get_diagnostics(run)

    if diagnostics.get("candidate_totals_status", "").startswith("error"):
        warnings.append("Candidate totals request had an error, but committee totals are available.")

    recent_filings = summary.get("recent_filings")
    if not isinstance(recent_filings, list):
        recent_filings = []

    filing_briefs = []

    for filing in recent_filings[:5]:
        if not isinstance(filing, dict):
            continue

        filing_briefs.append(
            {
                "document_description": filing.get("document_description", ""),
                "report_type": filing.get("report_type", ""),
                "receipt_date": filing.get("receipt_date", ""),
                "coverage_start_date": filing.get("coverage_start_date", ""),
                "coverage_end_date": filing.get("coverage_end_date", ""),
                "total_receipts": filing.get("total_receipts"),
                "total_disbursements": filing.get("total_disbursements"),
                "cash_on_hand_end_period": filing.get("cash_on_hand_end_period"),
                "html_url": filing.get("html_url", ""),
                "pdf_url": filing.get("pdf_url", ""),
            }
        )

    return {
        "title": "Money Position",
        "status": run.get("run_status", ""),
        "statements": statements,
        "metrics": {
            "candidate_id": summary.get("candidate_id", ""),
            "committee_id": summary.get("committee_id", ""),
            "cycle": summary.get("cycle", ""),
            "cash_on_hand": summary.get("cash_on_hand"),
            "total_receipts": summary.get("total_receipts"),
            "total_disbursements": summary.get("total_disbursements"),
            "committee_debt": summary.get("committee_debt"),
            "coverage_end_date": summary.get("coverage_end_date", ""),
            "latest_filing": summary.get("latest_filing", ""),
            "debt_records_returned": summary.get("debt_records_returned", 0),
            "loan_records_returned": summary.get("loan_records_returned", 0),
            "recent_filings_returned": summary.get("recent_filings_returned", 0),
        },
        "recent_filings": filing_briefs,
        "warnings": warnings,
        "source": source_line(run),
    }


def summarize_bill(bill: Dict[str, Any]) -> Dict[str, Any]:
    latest_action = bill.get("latestAction")
    if not isinstance(latest_action, dict):
        latest_action = {}

    policy_area = bill.get("policyArea")
    if not isinstance(policy_area, dict):
        policy_area = {}

    return {
        "type": bill.get("type", ""),
        "number": bill.get("number", ""),
        "title": bill.get("title", ""),
        "introduced_date": bill.get("introducedDate", ""),
        "policy_area": policy_area.get("name", ""),
        "latest_action_date": latest_action.get("actionDate", ""),
        "latest_action_text": latest_action.get("text", ""),
        "url": bill.get("url", ""),
    }


def build_legislative_activity_section(runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    congress_run = runs_by_module.get("congress_legislation")
    openstates_run = runs_by_module.get("openstates_legislation")

    congress_summary = get_summary(congress_run)
    openstates_summary = get_summary(openstates_run)

    statements = []
    warnings = []

    sponsored = congress_summary.get("sponsored_legislation")
    if not isinstance(sponsored, list):
        sponsored = []

    cosponsored = congress_summary.get("cosponsored_legislation")
    if not isinstance(cosponsored, list):
        cosponsored = []

    enriched = congress_summary.get("enriched_bills")
    if not isinstance(enriched, list):
        enriched = []

    if congress_run:
        statements.append(
            make_statement(
                f"Congress.gov returned {safe_int(congress_summary.get('sponsored_returned'))} sponsored item(s), {safe_int(congress_summary.get('cosponsored_returned'))} cosponsored item(s), and {safe_int(congress_summary.get('enriched_bills_returned'))} enriched bill detail record(s).",
                "congress_legislation",
                congress_run,
                ["sponsored_returned", "cosponsored_returned", "enriched_bills_returned"],
            )
        )

        if congress_summary.get("latest_sponsored_bill"):
            statements.append(
                make_statement(
                    f"Latest sponsored bill: {congress_summary.get('latest_sponsored_bill')}.",
                    "congress_legislation",
                    congress_run,
                    ["latest_sponsored_bill"],
                )
            )

        if congress_summary.get("latest_cosponsored_bill"):
            statements.append(
                make_statement(
                    f"Latest cosponsored bill: {congress_summary.get('latest_cosponsored_bill')}.",
                    "congress_legislation",
                    congress_run,
                    ["latest_cosponsored_bill"],
                )
            )
    else:
        statements.append(
            make_statement(
                "Congress.gov legislation has not been run for this profile or is not applicable.",
                "congress_legislation",
                None,
                [],
            )
        )

    if openstates_run:
        if openstates_summary.get("openstates_person_id"):
            statements.append(
                make_statement(
                    f"OpenStates matched this profile to {openstates_summary.get('openstates_person_id')}.",
                    "openstates_legislation",
                    openstates_run,
                    ["openstates_person_id"],
                )
            )

        statements.append(
            make_statement(
                f"OpenStates returned {safe_int(openstates_summary.get('bills_returned'))} bill(s), {safe_int(openstates_summary.get('votes_returned'))} vote(s), and {safe_int(openstates_summary.get('committees_returned'))} committee record(s).",
                "openstates_legislation",
                openstates_run,
                ["bills_returned", "votes_returned", "committees_returned"],
            )
        )

        if safe_int(openstates_summary.get("request_error_count")) > 0:
            warnings.append("OpenStates returned usable data but still has request warnings.")

    return {
        "title": "Legislative / Official Activity",
        "status": "available" if congress_run or openstates_run else "missing",
        "statements": statements,
        "congress": {
            "source": source_line(congress_run),
            "metrics": {
                "bioguide_id": congress_summary.get("bioguide_id", ""),
                "congress": congress_summary.get("congress", ""),
                "sponsored_returned": congress_summary.get("sponsored_returned", 0),
                "cosponsored_returned": congress_summary.get("cosponsored_returned", 0),
                "enriched_bills_returned": congress_summary.get("enriched_bills_returned", 0),
                "policy_areas_preview": congress_summary.get("policy_areas_preview", []),
            },
            "sponsored_legislation": [summarize_bill(bill) for bill in sponsored[:5] if isinstance(bill, dict)],
            "cosponsored_legislation": [summarize_bill(bill) for bill in cosponsored[:5] if isinstance(bill, dict)],
        },
        "openstates": {
            "source": source_line(openstates_run),
            "metrics": {
                "openstates_person_id": openstates_summary.get("openstates_person_id", ""),
                "openstates_url": openstates_summary.get("openstates_url", ""),
                "bills_returned": openstates_summary.get("bills_returned", 0),
                "votes_returned": openstates_summary.get("votes_returned", 0),
                "committees_returned": openstates_summary.get("committees_returned", 0),
                "request_error_count": openstates_summary.get("request_error_count", 0),
            },
        },
        "warnings": warnings,
    }


def build_media_attention_section(runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    youtube_run = runs_by_module.get("youtube_media")
    mentions_run = runs_by_module.get("web_mentions")

    youtube_summary = get_summary(youtube_run)
    mentions_summary = get_summary(mentions_run)

    statements = []

    if youtube_run:
        channel_title = first_value(youtube_summary.get("channel_title"), youtube_summary.get("title"))

        if channel_title:
            statements.append(
                make_statement(
                    f"YouTube channel title: {channel_title}.",
                    "youtube_media",
                    youtube_run,
                    ["channel_title"],
                )
            )

        if youtube_summary.get("latest_upload_date"):
            statements.append(
                make_statement(
                    f"Latest YouTube upload date: {youtube_summary.get('latest_upload_date')}.",
                    "youtube_media",
                    youtube_run,
                    ["latest_upload_date"],
                )
            )
    else:
        statements.append(
            make_statement(
                "YouTube media has not been run for this profile.",
                "youtube_media",
                None,
                [],
            )
        )

    if mentions_run:
        statements.append(
            make_statement(
                f"Web mentions returned: {safe_int(mentions_summary.get('external_mentions_returned'))}.",
                "web_mentions",
                mentions_run,
                ["external_mentions_returned"],
            )
        )

        if mentions_summary.get("latest_published_date"):
            statements.append(
                make_statement(
                    f"Latest web mention date: {mentions_summary.get('latest_published_date')}.",
                    "web_mentions",
                    mentions_run,
                    ["latest_published_date"],
                )
            )
    else:
        statements.append(
            make_statement(
                "Web mentions have not been run for this profile.",
                "web_mentions",
                None,
                [],
            )
        )

    latest_videos = first_value_list(
        youtube_summary.get("latest_videos"),
        youtube_summary.get("videos"),
        youtube_summary.get("proof_video_links"),
    )

    mentions = first_value_list(
        mentions_summary.get("external_mentions"),
        mentions_summary.get("mentions"),
        mentions_summary.get("articles"),
        mentions_summary.get("results"),
    )

    return {
        "title": "Media / Public Attention",
        "status": "available" if youtube_run or mentions_run else "missing",
        "statements": statements,
        "youtube": {
            "source": source_line(youtube_run),
            "metrics": {
                "channel_title": youtube_summary.get("channel_title", ""),
                "channel_url": youtube_summary.get("channel_url", ""),
                "video_count": youtube_summary.get("video_count", ""),
                "view_count": youtube_summary.get("view_count", ""),
                "subscriber_count": youtube_summary.get("subscriber_count", ""),
                "latest_upload_date": youtube_summary.get("latest_upload_date", ""),
            },
            "latest_videos": latest_videos[:5],
        },
        "web_mentions": {
            "source": source_line(mentions_run),
            "metrics": {
                "external_mentions_returned": mentions_summary.get("external_mentions_returned", 0),
                "raw_results_returned": mentions_summary.get("raw_results_returned", 0),
                "latest_published_date": mentions_summary.get("latest_published_date", ""),
                "search_query_used": mentions_summary.get("search_query_used", ""),
            },
            "mentions": mentions[:10],
        },
    }


def build_official_web_readiness_section(runs_by_module: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    run = runs_by_module.get("official_web_contact")
    summary = get_summary(run)

    if not run:
        return {
            "title": "Official Web / Contact Readiness",
            "status": "missing",
            "statements": [
                make_statement(
                    "Official web and contact verification has not been run for this profile.",
                    "official_web_contact",
                    None,
                    [],
                )
            ],
            "metrics": {},
            "reachable_urls": [],
            "failed_urls": [],
            "skipped_source_urls": [],
        }

    statements = [
        make_statement(
            f"Official web/contact verification checked {safe_int(summary.get('urls_checked'))} public URL(s).",
            "official_web_contact",
            run,
            ["urls_checked"],
        ),
        make_statement(
            f"Reachable URL count: {safe_int(summary.get('reachable_count'))}.",
            "official_web_contact",
            run,
            ["reachable_count"],
        ),
        make_statement(
            f"Failed URL count: {safe_int(summary.get('failed_count'))}.",
            "official_web_contact",
            run,
            ["failed_count"],
        ),
    ]

    if summary.get("primary_official_url"):
        statements.append(
            make_statement(
                f"Primary official URL: {summary.get('primary_official_url')}.",
                "official_web_contact",
                run,
                ["primary_official_url"],
            )
        )

    if summary.get("primary_contact_url"):
        statements.append(
            make_statement(
                f"Primary contact URL: {summary.get('primary_contact_url')}.",
                "official_web_contact",
                run,
                ["primary_contact_url"],
            )
        )

    return {
        "title": "Official Web / Contact Readiness",
        "status": run.get("run_status", ""),
        "statements": statements,
        "metrics": {
            "urls_checked": summary.get("urls_checked", 0),
            "reachable_count": summary.get("reachable_count", 0),
            "failed_count": summary.get("failed_count", 0),
            "redirected_count": summary.get("redirected_count", 0),
            "skipped_source_url_count": summary.get("skipped_source_url_count", 0),
            "official_url_count": summary.get("official_url_count", 0),
            "campaign_url_count": summary.get("campaign_url_count", 0),
            "contact_url_count": summary.get("contact_url_count", 0),
            "social_url_count": summary.get("social_url_count", 0),
            "primary_official_url": summary.get("primary_official_url", ""),
            "primary_campaign_url": summary.get("primary_campaign_url", ""),
            "primary_contact_url": summary.get("primary_contact_url", ""),
        },
        "reachable_urls": summary.get("reachable_urls", []),
        "failed_urls": summary.get("failed_urls", []),
        "skipped_source_urls": summary.get("skipped_source_urls", []),
        "source": source_line(run),
    }


def build_source_gaps_section(coverage: Dict[str, Any]) -> Dict[str, Any]:
    rows = coverage.get("coverage_rows", [])
    gaps = []
    warnings = []

    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, dict):
                continue

            status = row.get("status")

            if status in {"missing", "failed", "partial"}:
                gaps.append(
                    {
                        "module_name": row.get("module_name", ""),
                        "label": row.get("label", ""),
                        "status": status,
                        "next_action": row.get("next_action", ""),
                        "notes": row.get("notes", []),
                    }
                )

            if status == "complete_with_warnings":
                warnings.append(
                    {
                        "module_name": row.get("module_name", ""),
                        "label": row.get("label", ""),
                        "status": status,
                        "next_action": row.get("next_action", ""),
                        "notes": row.get("notes", []),
                    }
                )

    return {
        "title": "Source Gaps and Next Actions",
        "completion_score": coverage.get("completion_score"),
        "status_counts": coverage.get("status_counts", {}),
        "next_best_action": coverage.get("next_best_action", {}),
        "gaps": gaps,
        "warnings": warnings,
    }


def build_briefing_warnings(sections: Dict[str, Any]) -> List[str]:
    warnings = []

    money_warnings = sections.get("money_position", {}).get("warnings", [])
    if isinstance(money_warnings, list):
        warnings.extend(money_warnings)

    legislative_warnings = sections.get("legislative_activity", {}).get("warnings", [])
    if isinstance(legislative_warnings, list):
        warnings.extend(legislative_warnings)

    source_warnings = sections.get("source_gaps", {}).get("warnings", [])
    if isinstance(source_warnings, list):
        for warning in source_warnings:
            if isinstance(warning, dict):
                label = warning.get("label", "")
                if label:
                    warnings.append(f"{label} is usable but has warnings.")

    opposition = sections.get("opposition_intelligence", {})
    if isinstance(opposition, dict):
        status = opposition.get("status")
        if status == "scaffold_only":
            warnings.append("Opponent intelligence is scaffold-only because no source-backed opponent records are currently available.")

    return warnings


def build_copy_brief(briefing: Dict[str, Any]) -> str:
    lines = []
    profile_name = briefing.get("profile_name", "Profile")

    lines.append(f"Strategic Intelligence Briefing: {profile_name}")
    lines.append("")

    for section_key in [
        "overall_read",
        "race_context",
        "opposition_intelligence",
        "money_position",
        "legislative_activity",
        "media_attention",
        "official_web_readiness",
        "source_gaps",
    ]:
        section = briefing.get(section_key, {})

        if not isinstance(section, dict):
            continue

        title = section.get("title", section_key)
        lines.append(title)

        statements = section.get("statements", [])

        if isinstance(statements, list):
            for statement in statements:
                if isinstance(statement, dict) and statement.get("text"):
                    lines.append(f"- {statement['text']}")

        if section_key == "opposition_intelligence":
            metrics = section.get("metrics", {})
            if isinstance(metrics, dict):
                source_backed_opponent_count = safe_int(metrics.get("source_backed_opponent_count"))
                if source_backed_opponent_count > 0:
                    lines.append(f"- Primary opponents: {safe_int(metrics.get('primary_opponent_count'))}")
                    lines.append(f"- General election opponents: {safe_int(metrics.get('general_election_opponent_count'))}")
                    lines.append(f"- Third-party/other opponents: {safe_int(metrics.get('third_party_or_other_opponent_count'))}")
                    lines.append(f"- Raised-funds opponents: {safe_int(metrics.get('raised_funds_opponent_count'))}")

            opponent_segments = section.get("opponent_segments", {})
            if isinstance(opponent_segments, dict):
                primary_opponents = opponent_segments.get("primary_opponents")
                general_opponents = opponent_segments.get("general_election_opponents")

                if isinstance(primary_opponents, list) and primary_opponents:
                    lines.append("- Primary opponent names: " + ", ".join([opponent.get("name", "") for opponent in primary_opponents if isinstance(opponent, dict) and opponent.get("name")]))

                if isinstance(general_opponents, list) and general_opponents:
                    lines.append("- General election opponent names: " + ", ".join([opponent.get("name", "") for opponent in general_opponents if isinstance(opponent, dict) and opponent.get("name")]))

        if section_key == "source_gaps":
            next_best_action = section.get("next_best_action", {})
            if isinstance(next_best_action, dict) and next_best_action.get("next_action"):
                lines.append(f"- Next best action: {next_best_action.get('next_action')}")

        lines.append("")

    lines.append("Source-backed only.  No AI-generated claims or unsourced inferences included.")

    return "\n".join(lines).strip()


def build_strategic_briefing(
    profile_id: str,
    person: Dict[str, Any],
    latest_runs: List[Dict[str, Any]],
    coverage: Dict[str, Any],
) -> Dict[str, Any]:
    runs_by_module = latest_run_by_module(latest_runs)
    profile_name = get_profile_name(person, profile_id)

    sections = {
        "overall_read": build_overall_read(profile_id, person, runs_by_module, coverage),
        "race_context": build_race_context_section(runs_by_module),
        "opposition_intelligence": build_opposition_intelligence_section(runs_by_module),
        "money_position": build_money_position_section(runs_by_module),
        "legislative_activity": build_legislative_activity_section(runs_by_module),
        "media_attention": build_media_attention_section(runs_by_module),
        "official_web_readiness": build_official_web_readiness_section(runs_by_module),
        "source_gaps": build_source_gaps_section(coverage),
    }

    briefing = {
        "profile_id": profile_id,
        "profile_name": profile_name,
        "generated_at": utc_now_iso(),
        "briefing_version": "v1.7A.1",
        "source_backed_only": True,
        "ai_generated": False,
        "profile_context": {
            "name": profile_name,
            "title": get_profile_title(person),
            "party": get_profile_party(person),
        },
        **sections,
        "briefing_warnings": build_briefing_warnings(sections),
        "source_inventory": {
            "latest_run_count": len(latest_runs),
            "modules_present": sorted(runs_by_module.keys()),
        },
    }

    briefing["copy_brief"] = build_copy_brief(briefing)

    return briefing