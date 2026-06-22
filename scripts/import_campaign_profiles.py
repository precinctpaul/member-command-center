import argparse
import json
import shutil
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = PROJECT_ROOT / "server"
DATA_DIR = PROJECT_ROOT / "data"
MEMBER_PEOPLE_PATH = DATA_DIR / "people.json"
DEFAULT_CAMPAIGN_ROOT = Path(r"C:\dev\campaign-command-center")

sys.path.insert(0, str(SERVER_DIR))

import db  # noqa: E402


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
    "no source configured",
    "no media source configured",
    "no media result cached yet",
    "missing_source",
    "source_needed",
    "not_loaded",
}

STATUS_FIELDS = {
    "profileSourceStatus",
    "websiteSourceStatus",
    "bioSourceStatus",
    "headshotSourceStatus",
    "mapSourceStatus",
    "financeSourceStatus",
    "stateFinanceSourceStatus",
    "electionSourceStatus",
    "mapLayerSourceStatus",
    "votingRecordSourceStatus",
    "mediaStatus",
    "legislationStatus",
    "factCheckStatus",
}

SOURCE_FIELD_LABELS = {
    "sourceUrl": ("Roster source", "roster-source"),
    "officialWebsite": ("Official website", "official-site"),
    "campaignWebsite": ("Campaign website", "campaign-site"),
    "officialWebsiteSource": ("Official website source", "official-source"),
    "campaignWebsiteSource": ("Campaign website source", "campaign-source"),
    "headshotSource": ("Headshot source", "headshot-source"),
    "bioSource": ("Bio source", "bio-source"),
    "congressGovUrl": ("Congress.gov profile", "federal-legislative"),
    "openStatesUrl": ("OpenStates profile", "state-legislative"),
    "financeSourceUrl": ("Finance source", "campaign-finance"),
    "cashOnHandSource": ("Cash on hand source", "campaign-finance"),
    "stateFinanceSourceUrl": ("State finance source", "state-finance"),
    "electionSourceUrl": ("Election source", "election"),
    "nextElectionSource": ("Next election source", "election"),
    "votingRecordSourceUrl": ("Voting record source", "voting-record"),
    "votingRecordSource": ("Voting record source", "voting-record"),
    "legislationSource": ("Legislative source", "legislative"),
    "sponsoredLegislationUrl": ("Sponsored legislation", "legislative"),
    "cosponsoredLegislationUrl": ("Cosponsored legislation", "legislative"),
    "mapCenterSource": ("Map center source", "map"),
    "mapLayerSourceUrl": ("Map layer source", "map"),
    "mapLayerGeoJsonUrl": ("Map layer GeoJSON", "map"),
}

MAPPED_CAMPAIGN_FIELDS = {
    "_collection",
    "id",
    "nodeId",
    "candidateId",
    "candidateName",
    "canonicalName",
    "canonical_name",
    "display_name",
    "roleType",
    "lastUpdated",
    "rosterGroupName",
    "rosterGroupSlug",
    "group_name",
    "group_slug",
    "chamber",
    "title",
    "role",
    "party",
    "districtLabel",
    "state",
    "district",
    "sourceUrl",
    "officialWebsite",
    "officialWebsiteSource",
    "campaignWebsite",
    "campaignWebsiteSource",
    "headshotUrl",
    "headshotSource",
    "headshotAlt",
    "shortBio",
    "biographyHtml",
    "bioSource",
    "bioguideId",
    "congressGovUrl",
    "openStatesPersonId",
    "openStatesUrl",
    "fecCandidateId",
    "fecCommitteeId",
    "fecCommitteeName",
    "fecCycle",
    "cashOnHand",
    "cashOnHandSource",
    "cashOnHandAsOf",
    "receipts",
    "disbursements",
    "debtsOwed",
    "individualContributions",
    "financeSourceUrl",
    "financeSourceType",
    "stateFinanceCandidateId",
    "stateFinanceCommitteeId",
    "stateFinanceCommitteeName",
    "stateFinanceSource",
    "stateFinanceSourceUrl",
    "stateFinanceJurisdiction",
    "stateFinanceCycle",
    "stateFinanceAsOf",
    "stateCashOnHand",
    "stateReceipts",
    "stateDisbursements",
    "stateDebts",
    "stateIndividualContributions",
    "nextElection",
    "nextElectionSource",
    "electionOffice",
    "electionState",
    "electionDistrict",
    "electionCycle",
    "primaryDate",
    "generalDate",
    "electionSource",
    "electionSourceUrl",
    "votingRecordSummary",
    "votingRecordSource",
    "votingRecordSourceUrl",
    "votingRecordChamber",
    "votingRecordPeriod",
    "keyVotesCount",
    "recentVotesCount",
    "missedVotesCount",
    "voteAlignmentNotes",
    "sponsoredLegislationCount",
    "sponsoredLegislationUrl",
    "cosponsoredLegislationCount",
    "cosponsoredLegislationUrl",
    "legislationSource",
    "mapCenter",
    "mapZoom",
    "mapCenterSource",
    "mapLayerType",
    "mapLayerSource",
    "mapLayerSourceUrl",
    "mapLayerGeoJsonUrl",
    "mapLayerName",
    "mapLayerDistrict",
    "mapLayerState",
    "mapLayerUpdatedAt",
    "youtubeChannelId",
    "youtubeSearchQuery",
    "vimeoUserId",
    "vimeoSearchQuery",
    "googleSearchQuery",
    *STATUS_FIELDS,
}

STATE_NAME_TO_CODE = {
    "ALABAMA": "AL",
    "ALASKA": "AK",
    "ARIZONA": "AZ",
    "ARKANSAS": "AR",
    "CALIFORNIA": "CA",
    "COLORADO": "CO",
    "CONNECTICUT": "CT",
    "DELAWARE": "DE",
    "DISTRICT OF COLUMBIA": "DC",
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
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        text = value.strip()
        return bool(text) and text.lower() not in PLACEHOLDER_VALUES
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, dict):
        return any(has_value(item) for item in value.values())
    return True


def first_value(*values: Any) -> str:
    for value in values:
        if has_value(value):
            return str(value).strip()
    return ""


def first_raw(*values: Any) -> Any:
    for value in values:
        if has_value(value):
            return value
    return ""


def slugify(value: Any) -> str:
    text = str(value or "").strip().lower()
    output = []
    for character in text:
        if character.isalnum():
            output.append(character)
        elif character in {" ", "-", "_", ".", "/", "'"}:
            output.append("-")
    slug = "".join(output)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "profile"


def comparable(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().replace("-", " ").replace("_", " ").split())


def state_code(value: Any) -> str:
    raw = str(value or "").strip()
    upper = raw.upper()
    if len(upper) == 2 and upper.isalpha():
        return upper
    return STATE_NAME_TO_CODE.get(upper, raw)


def normalize_group(value: Any, fallback: str = "") -> str:
    text = first_value(value, fallback)
    low = text.lower()
    if "majority" in low:
        return "Majority Democrats"
    if "bench" in low:
        return "The Bench"
    if "cabinet" in low or "executive" in low:
        return "Cabinet/Others"
    if "other" in low or "opposition" in low:
        return "Other / Executive / Opposition"
    return text or "Other / Executive / Opposition"


def infer_office_type(node: Dict[str, Any]) -> str:
    text = " ".join(
        first_value(node.get(key))
        for key in ["chamber", "title", "role", "rosterGroupName", "roleType"]
    ).lower()
    if first_value(node.get("bioguideId"), node.get("congressGovUrl")) or "congress" in text or "house" in text:
        return "Federal"
    if first_value(node.get("openStatesPersonId"), node.get("openStatesUrl")) or "assembly" in text or "state senator" in text:
        return "State"
    if "governor" in text or "mayor" in text or "state" in text:
        return "State"
    if "cabinet" in text or "secretary" in text or "director" in text or "administrator" in text:
        return "Executive"
    return ""


def district_label(node: Dict[str, Any]) -> str:
    existing = first_value(node.get("districtLabel"))
    if existing:
        return existing
    state = state_code(node.get("state"))
    district = first_value(node.get("district"))
    if state and district:
        if district.isdigit():
            return f"{state}-{district.zfill(2)}"
        return f"{state}-{district}"
    return district


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, payload: Any) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")


def discover_campaign_files(campaign_root: Path) -> Dict[str, Any]:
    memory_path = campaign_root / "campaign_memory_store.json"
    source_map_path = campaign_root / "person_source_map.json"
    db_path = campaign_root / "govintel_dev.db"
    html_roster_files = [
        campaign_root / "majority_democrats.html",
        campaign_root / "the_bench.html",
        campaign_root / "cabinet_others.html",
    ]
    return {
        "campaign_root": str(campaign_root),
        "campaign_memory_store": {"path": str(memory_path), "exists": memory_path.exists()},
        "person_source_map": {"path": str(source_map_path), "exists": source_map_path.exists()},
        "govintel_dev_db": {"path": str(db_path), "exists": db_path.exists()},
        "html_roster_files": [{"path": str(path), "exists": path.exists()} for path in html_roster_files],
    }


def load_campaign_nodes(campaign_root: Path) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    memory_path = campaign_root / "campaign_memory_store.json"
    source_map_path = campaign_root / "person_source_map.json"
    memory = read_json(memory_path, {})
    source_map = read_json(source_map_path, {})
    source_by_node_id = {
        str(node_id).strip().upper(): entry
        for node_id, entry in source_map.items()
        if isinstance(entry, dict)
    }
    merged: Dict[str, Dict[str, Any]] = {}

    collection_groups = {
        "coreOps": "Majority Democrats",
        "frontline": "The Bench",
        "executive": "Cabinet/Others",
    }

    for collection, fallback_group in collection_groups.items():
        for node in memory.get(collection, []) if isinstance(memory.get(collection), list) else []:
            if not isinstance(node, dict):
                continue
            node_id = first_value(node.get("nodeId"), node.get("candidateId"))
            if not node_id:
                continue
            key = node_id.upper()
            source_entry = source_by_node_id.get(key, {})
            merged[key] = {
                **node,
                **source_entry,
                "nodeId": node_id,
                "_collection": collection,
                "rosterGroupName": first_value(source_entry.get("rosterGroupName"), node.get("rosterGroupName"), fallback_group),
                "rosterGroupSlug": first_value(source_entry.get("rosterGroupSlug"), node.get("rosterGroupSlug")),
            }

    for node_id, source_entry in source_by_node_id.items():
        if node_id in merged:
            continue
        merged[node_id] = {
            **source_entry,
            "nodeId": node_id,
            "_collection": "person_source_map",
            "rosterGroupName": first_value(source_entry.get("rosterGroupName")),
            "rosterGroupSlug": first_value(source_entry.get("rosterGroupSlug")),
        }

    diagnostics = inspect_campaign_database(campaign_root / "govintel_dev.db")
    return list(merged.values()), {
        "memory_counts": {
            "coreOps": len(memory.get("coreOps", [])) if isinstance(memory.get("coreOps"), list) else 0,
            "frontline": len(memory.get("frontline", [])) if isinstance(memory.get("frontline"), list) else 0,
            "executive": len(memory.get("executive", [])) if isinstance(memory.get("executive"), list) else 0,
        },
        "source_map_entries": len(source_by_node_id),
        "database": diagnostics,
    }


def inspect_campaign_database(db_path: Path) -> Dict[str, Any]:
    if not db_path.exists():
        return {"exists": False}
    try:
        connection = sqlite3.connect(db_path)
        connection.row_factory = sqlite3.Row
        tables = [
            row["name"]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").fetchall()
        ]
        output = {"exists": True, "tables": tables}
        if "tracked_people" in tables:
            output["tracked_people_count"] = connection.execute("SELECT COUNT(*) AS count FROM tracked_people").fetchone()["count"]
        if "person_roster_memberships" in tables:
            output["person_roster_memberships_count"] = connection.execute("SELECT COUNT(*) AS count FROM person_roster_memberships").fetchone()["count"]
        if "roster_groups" in tables:
            groups = connection.execute("SELECT name, slug FROM roster_groups ORDER BY name").fetchall()
            output["roster_groups"] = [{"name": row["name"], "slug": row["slug"]} for row in groups]
        connection.close()
        return output
    except Exception as error:
        return {"exists": True, "error": str(error)}


def build_source_tracking(node: Dict[str, Any]) -> List[Dict[str, Any]]:
    records = []
    seen = set()
    for field, (label, source_type) in SOURCE_FIELD_LABELS.items():
        value = node.get(field)
        if not has_value(value):
            continue
        text = str(value).strip()
        if not text.startswith("http"):
            continue
        key = (label, text)
        if key in seen:
            continue
        seen.add(key)
        records.append(
            {
                "label": label,
                "value": text,
                "type": source_type,
                "sourceName": "Campaign Command Center import",
                "sourceUrl": text,
                "lastChecked": "",
                "confidence": "Imported source-backed field",
            }
        )
    return records


def build_source_endpoints(node: Dict[str, Any]) -> Dict[str, Any]:
    mapping = {
        "campaignRosterSource": "sourceUrl",
        "officialWebsite": "officialWebsite",
        "campaignWebsite": "campaignWebsite",
        "congressGovProfile": "congressGovUrl",
        "openStatesProfile": "openStatesUrl",
        "financeSource": "financeSourceUrl",
        "stateFinanceSource": "stateFinanceSourceUrl",
        "electionSource": "electionSourceUrl",
        "votingRecordSource": "votingRecordSourceUrl",
        "sponsoredLegislation": "sponsoredLegislationUrl",
        "cosponsoredLegislation": "cosponsoredLegislationUrl",
        "mapLayerSource": "mapLayerSourceUrl",
        "mapLayerGeoJson": "mapLayerGeoJsonUrl",
    }
    return {target: node.get(source) for target, source in mapping.items() if has_value(node.get(source))}


def html_to_text(value: Any) -> str:
    text = str(value or "")
    return (
        text.replace("<p>", "")
        .replace("</p>", "")
        .replace("<br>", " ")
        .replace("<br/>", " ")
        .replace("<br />", " ")
        .strip()
    )


def normalize_campaign_profile(node: Dict[str, Any], imported_at: str) -> Dict[str, Any]:
    node_id = first_value(node.get("nodeId"), node.get("candidateId"))
    display_name = first_value(node.get("candidateName"), node.get("display_name"), node.get("canonicalName"), "Unknown Person")
    state = state_code(node.get("state"))
    group = normalize_group(node.get("rosterGroupName"), node.get("_collection"))
    profile_id = f"campaign-{slugify(node_id)}"
    short_bio = first_value(node.get("shortBio"), html_to_text(node.get("biographyHtml")))
    office_type = infer_office_type(node)
    title = first_value(node.get("title"), node.get("role"), "Profile")
    endpoints = build_source_endpoints(node)
    source_tracking = build_source_tracking(node)
    source_status = {field: node.get(field) for field in STATUS_FIELDS if has_value(node.get(field))}

    profile: Dict[str, Any] = {
        "id": profile_id,
        "displayName": display_name,
        "preferredName": display_name.split(" ")[0] if display_name else "",
        "fullName": first_value(node.get("canonicalName"), display_name),
        "title": title,
        "role": first_value(node.get("role")),
        "party": first_value(node.get("party")),
        "district": district_label(node),
        "state": state,
        "stateName": first_value(node.get("state")) if state and first_value(node.get("state")) != state else "",
        "officeType": office_type,
        "jurisdiction": first_value(node.get("chamber"), node.get("role"), group),
        "currentOffice": title,
        "active": True,
        "rosterGroupName": group,
        "rosterGroupSlug": first_value(node.get("rosterGroupSlug"), slugify(group)),
        "rosterGroups": [group],
        "category": group,
        "sourceSystem": "campaign-command-center-import",
        "sourceNodeId": node_id,
        "bio": {
            "oneLine": short_bio,
            "short": short_bio,
            "standard": "",
            "long": "",
        },
        "officialLinks": {
            "officialWebsite": first_value(node.get("officialWebsite")),
            "campaignWebsite": first_value(node.get("campaignWebsite")),
            "congressGovProfile": first_value(node.get("congressGovUrl")),
            "openStatesProfile": first_value(node.get("openStatesUrl")),
            "youtubeChannelId": first_value(node.get("youtubeChannelId")),
        },
        "headshot": {
            "primaryUrl": first_value(node.get("headshotUrl")),
            "source": first_value(node.get("headshotSource")),
            "altText": first_value(node.get("headshotAlt"), f"{display_name} headshot"),
            "usageNote": "Imported from Campaign Command Center source fields.",
        },
        "sourceIdentity": {
            "campaignCommandCenterNodeId": node_id,
            "bioguideId": first_value(node.get("bioguideId")),
            "fecCandidateId": first_value(node.get("fecCandidateId")),
            "fecPrincipalCommitteeId": first_value(node.get("fecCommitteeId")),
            "openStatesPersonId": first_value(node.get("openStatesPersonId")),
            "youtubeChannelId": first_value(node.get("youtubeChannelId")),
        },
        "campaignFinanceSnapshot": {
            "committeeName": first_value(node.get("fecCommitteeName")),
            "fecCandidateId": first_value(node.get("fecCandidateId")),
            "fecPrincipalCommitteeId": first_value(node.get("fecCommitteeId")),
            "cashOnHand": first_value(node.get("cashOnHand"), node.get("stateCashOnHand")),
            "totalReceipts": first_value(node.get("receipts"), node.get("stateReceipts")),
            "totalDisbursements": first_value(node.get("disbursements"), node.get("stateDisbursements")),
            "sourceUrl": first_value(node.get("financeSourceUrl"), node.get("stateFinanceSourceUrl"), node.get("cashOnHandSource")),
            "proofNotes": "Imported only from existing Campaign Command Center source fields; no values were inferred.",
        },
        "raceContext": {
            "moduleStatus": "Imported source fields" if has_value(node.get("electionSourceUrl")) else "Not started",
            "electionCycle": first_value(node.get("electionCycle")),
            "office": first_value(node.get("electionOffice"), node.get("title")),
            "district": first_value(node.get("electionDistrict"), node.get("district"), node.get("districtLabel")),
            "incumbentStatus": first_value(node.get("roleType")),
            "primaryDate": first_value(node.get("primaryDate")),
            "generalDate": first_value(node.get("generalDate")),
            "electionRulesSource": first_value(node.get("electionSource")),
            "electionSourceUrl": first_value(node.get("electionSourceUrl"), node.get("nextElectionSource")),
            "opponentDataSource": "",
            "implementationNote": "Imported election fields do not complete opponent/contrast or polling readiness.",
        },
        "legislativeMechanics": {
            "moduleStatus": "Imported source fields" if has_value(first_value(node.get("congressGovUrl"), node.get("openStatesUrl"))) else "Not started",
            "bioguideId": first_value(node.get("bioguideId")),
            "congressGovUrl": first_value(node.get("congressGovUrl")),
            "openStatesPersonId": first_value(node.get("openStatesPersonId")),
            "openStatesUrl": first_value(node.get("openStatesUrl")),
            "sponsoredLegislationCount": first_raw(node.get("sponsoredLegislationCount")),
            "cosponsoredLegislationCount": first_raw(node.get("cosponsoredLegislationCount")),
            "sponsoredLegislationEndpoint": first_value(node.get("sponsoredLegislationUrl")),
            "cosponsoredLegislationEndpoint": first_value(node.get("cosponsoredLegislationUrl")),
            "votingRecordSummary": first_value(node.get("votingRecordSummary")),
            "votingRecordSource": first_value(node.get("votingRecordSource")),
            "votingRecordSourceUrl": first_value(node.get("votingRecordSourceUrl")),
        },
        "politicalGeography": {
            "moduleStatus": "Imported source fields" if has_value(first_value(node.get("mapCenter"), node.get("mapLayerSourceUrl"))) else "Not started",
            "district": district_label(node),
            "state": state,
            "mapCenter": first_raw(node.get("mapCenter")),
            "mapZoom": first_raw(node.get("mapZoom")),
            "mapCenterSource": first_value(node.get("mapCenterSource")),
            "mapLayerType": first_value(node.get("mapLayerType")),
            "mapLayerSource": first_value(node.get("mapLayerSource")),
            "mapLayerSourceUrl": first_value(node.get("mapLayerSourceUrl")),
            "mapLayerGeoJsonUrl": first_value(node.get("mapLayerGeoJsonUrl")),
            "mapLayerName": first_value(node.get("mapLayerName")),
        },
        "mediaTracking": {
            "moduleStatus": "Configured source fields" if has_value(first_value(node.get("youtubeChannelId"), node.get("youtubeSearchQuery"))) else "Not started",
            "youtubeChannelId": first_value(node.get("youtubeChannelId")),
            "youtubeSearchQuery": first_value(node.get("youtubeSearchQuery")),
            "vimeoUserId": first_value(node.get("vimeoUserId")),
            "vimeoSearchQuery": first_value(node.get("vimeoSearchQuery")),
            "googleSearchQuery": first_value(node.get("googleSearchQuery")),
        },
        "sourceTracking": source_tracking,
        "sourceEndpoints": endpoints,
        "sourceStatus": source_status,
        "proofStatus": {
            "identityHub": "Imported from Campaign Command Center",
            "universalProfile": "Imported",
            "officialLinks": source_status.get("websiteSourceStatus", ""),
            "headshot": source_status.get("headshotSourceStatus", ""),
            "bio": source_status.get("bioSourceStatus", ""),
            "finance": source_status.get("financeSourceStatus", ""),
            "election": source_status.get("electionSourceStatus", ""),
            "map": source_status.get("mapSourceStatus", ""),
        },
        "campaignImport": {
            "importedAt": imported_at,
            "sourceProject": str(DEFAULT_CAMPAIGN_ROOT),
            "nodeId": node_id,
            "roleType": first_value(node.get("roleType")),
            "collection": first_value(node.get("_collection")),
            "lastUpdated": first_value(node.get("lastUpdated")),
            "unmappedFieldNames": sorted(set(node.keys()) - MAPPED_CAMPAIGN_FIELDS),
        },
    }

    prune_empty(profile)
    return profile


def prune_empty(value: Any) -> Any:
    if isinstance(value, dict):
        for key in list(value.keys()):
            child = prune_empty(value[key])
            if child == "" or child == [] or child == {} or child is None:
                value.pop(key)
            else:
                value[key] = child
    elif isinstance(value, list):
        value[:] = [prune_empty(item) for item in value if item not in ("", None, [], {})]
    return value


def profile_identity_keys(profile: Dict[str, Any]) -> List[str]:
    keys = []
    for value in [
        profile.get("id"),
        profile.get("displayName"),
        profile.get("fullName"),
        profile.get("name"),
        profile.get("sourceNodeId"),
        profile.get("campaignImport", {}).get("nodeId") if isinstance(profile.get("campaignImport"), dict) else "",
        profile.get("sourceIdentity", {}).get("campaignCommandCenterNodeId") if isinstance(profile.get("sourceIdentity"), dict) else "",
        profile.get("sourceIdentity", {}).get("bioguideId") if isinstance(profile.get("sourceIdentity"), dict) else "",
        profile.get("sourceIdentity", {}).get("fecCandidateId") if isinstance(profile.get("sourceIdentity"), dict) else "",
        profile.get("sourceIdentity", {}).get("openStatesPersonId") if isinstance(profile.get("sourceIdentity"), dict) else "",
    ]:
        if has_value(value):
            if str(value).startswith("ocd-person/"):
                keys.append(f"openstates:{value}")
            elif str(value).upper().startswith(("H", "S", "P")) and len(str(value)) >= 9:
                keys.append(f"fec:{value}")
            elif len(str(value)) == 7 and str(value)[0].isalpha() and str(value)[1:].isdigit():
                keys.append(f"bioguide:{value}")
            else:
                keys.append(f"text:{comparable(value)}")
    return keys


def merge_missing(existing: Dict[str, Any], incoming: Dict[str, Any], path: str, warnings: List[str]) -> Tuple[Dict[str, Any], int]:
    changed = 0
    for key, incoming_value in incoming.items():
        current_path = f"{path}.{key}" if path else key
        if not has_value(incoming_value):
            continue
        if key not in existing or not has_value(existing.get(key)):
            existing[key] = incoming_value
            changed += 1
            continue
        existing_value = existing.get(key)
        if isinstance(existing_value, dict) and isinstance(incoming_value, dict):
            _, nested_changed = merge_missing(existing_value, incoming_value, current_path, warnings)
            changed += nested_changed
            continue
        if isinstance(existing_value, list) and isinstance(incoming_value, list):
            before = len(existing_value)
            seen = {json.dumps(item, sort_keys=True, ensure_ascii=False) for item in existing_value}
            for item in incoming_value:
                key_text = json.dumps(item, sort_keys=True, ensure_ascii=False)
                if key_text not in seen:
                    existing_value.append(item)
                    seen.add(key_text)
            changed += len(existing_value) - before
            continue
        if str(existing_value).strip() != str(incoming_value).strip():
            if current_path in {"id", "headshot.usageNote", "campaignFinanceSnapshot.proofNotes"}:
                continue
            warnings.append(f"Kept existing {current_path}; campaign value differed for {incoming.get('displayName', incoming.get('id', 'profile'))}.")
    return existing, changed


def build_import_plan(campaign_root: Path) -> Dict[str, Any]:
    imported_at = utc_now_iso()
    discovered = discover_campaign_files(campaign_root)
    campaign_nodes, campaign_diagnostics = load_campaign_nodes(campaign_root)
    member_profiles = read_json(MEMBER_PEOPLE_PATH, [])
    if not isinstance(member_profiles, list):
        member_profiles = []

    existing_key_to_index: Dict[str, int] = {}
    for index, profile in enumerate(member_profiles):
        if not isinstance(profile, dict):
            continue
        for key in profile_identity_keys(profile):
            existing_key_to_index.setdefault(key, index)

    planned_profiles = [dict(profile) for profile in member_profiles]
    inserts = []
    updates = []
    duplicates = []
    warnings = []
    source_counts = Counter()
    group_counts = Counter()
    unmapped_fields = Counter()
    imported_node_ids = set()

    for node in campaign_nodes:
        normalized = normalize_campaign_profile(node, imported_at)
        node_id = normalized.get("sourceNodeId", "")
        if node_id in imported_node_ids:
            duplicates.append({"node_id": node_id, "reason": "duplicate campaign node id"})
            continue
        imported_node_ids.add(node_id)

        group_counts[normalized.get("rosterGroupName", "")] += 1
        for field in [
            "officialWebsite",
            "campaignWebsite",
            "congressGovProfile",
            "openStatesProfile",
            "youtubeChannelId",
        ]:
            if has_value(normalized.get("officialLinks", {}).get(field)):
                source_counts[field] += 1
        if has_value(normalized.get("headshot", {}).get("primaryUrl")):
            source_counts["headshot"] += 1
        if has_value(normalized.get("bio", {}).get("short")):
            source_counts["bio"] += 1
        for field in ["bioguideId", "fecCandidateId", "fecPrincipalCommitteeId", "openStatesPersonId"]:
            if has_value(normalized.get("sourceIdentity", {}).get(field)):
                source_counts[field] += 1
        if has_value(normalized.get("raceContext", {}).get("electionSourceUrl")):
            source_counts["electionContext"] += 1
        if has_value(normalized.get("legislativeMechanics", {}).get("votingRecordSourceUrl")):
            source_counts["votingSource"] += 1
        if has_value(normalized.get("legislativeMechanics", {}).get("congressGovUrl")) or has_value(normalized.get("legislativeMechanics", {}).get("openStatesUrl")):
            source_counts["legislativeSource"] += 1
        for field in normalized.get("campaignImport", {}).get("unmappedFieldNames", []):
            unmapped_fields[field] += 1

        match_index: Optional[int] = None
        for key in profile_identity_keys(normalized):
            if key in existing_key_to_index:
                match_index = existing_key_to_index[key]
                break

        if match_index is None:
            planned_profiles.append(normalized)
            new_index = len(planned_profiles) - 1
            for key in profile_identity_keys(normalized):
                existing_key_to_index.setdefault(key, new_index)
            inserts.append({"profile_id": normalized.get("id"), "display_name": normalized.get("displayName"), "node_id": node_id})
            continue

        existing = planned_profiles[match_index]
        before = json.dumps(existing, ensure_ascii=False, sort_keys=True)
        merge_missing(existing, normalized, "", warnings)
        existing.setdefault("campaignImport", {})
        if isinstance(existing["campaignImport"], dict):
            existing["campaignImport"].setdefault("matchedCampaignNodeIds", [])
            if node_id and node_id not in existing["campaignImport"]["matchedCampaignNodeIds"]:
                existing["campaignImport"]["matchedCampaignNodeIds"].append(node_id)
        after = json.dumps(existing, ensure_ascii=False, sort_keys=True)
        if before != after:
            updates.append({"profile_id": existing.get("id"), "display_name": existing.get("displayName"), "node_id": node_id})
        else:
            duplicates.append({"profile_id": existing.get("id"), "display_name": existing.get("displayName"), "node_id": node_id, "reason": "already represented"})

    return {
        "generated_at": imported_at,
        "campaign_files_discovered": discovered,
        "campaign_diagnostics": campaign_diagnostics,
        "campaign_profiles_found": len(campaign_nodes),
        "member_profiles_before": len(member_profiles),
        "profiles_to_insert": inserts,
        "profiles_to_update": updates,
        "duplicates_skipped": duplicates,
        "group_counts": dict(group_counts),
        "source_field_counts": dict(source_counts),
        "unmapped_field_names": dict(sorted(unmapped_fields.items())),
        "warnings_conflicts": warnings,
        "planned_profiles": planned_profiles,
        "member_profiles_after_planned": len(planned_profiles),
    }


def print_summary(plan: Dict[str, Any], mode: str, applied: Optional[Dict[str, Any]] = None) -> None:
    print(f"Campaign profile import {mode}")
    print("=" * 72)
    print("Campaign files discovered:")
    discovered = plan["campaign_files_discovered"]
    for key, value in discovered.items():
        if isinstance(value, dict):
            print(f"  {key}: {'FOUND' if value.get('exists') else 'missing'} - {value.get('path')}")
        elif isinstance(value, list):
            for item in value:
                print(f"  {key}: {'FOUND' if item.get('exists') else 'missing'} - {item.get('path')}")
        else:
            print(f"  {key}: {value}")

    print("")
    print(f"Campaign profiles found: {plan['campaign_profiles_found']}")
    print(f"Member profiles before: {plan['member_profiles_before']}")
    print(f"Profiles to insert: {len(plan['profiles_to_insert'])}")
    print(f"Profiles to update: {len(plan['profiles_to_update'])}")
    print(f"Duplicates skipped: {len(plan['duplicates_skipped'])}")
    print(f"Member profiles after planned import: {plan['member_profiles_after_planned']}")

    if applied:
        print(f"Member profiles after apply: {applied.get('member_profiles_after')}")
        print(f"People cache after apply: {applied.get('people_cache_after')}")
        print(f"Backup written: {applied.get('backup_path')}")
        print(f"Report written: {applied.get('report_path')}")

    print("")
    print("Group counts:")
    for group, count in sorted(plan["group_counts"].items()):
        print(f"  {group or '(blank)'}: {count}")

    print("")
    print("Source field counts:")
    for field, count in sorted(plan["source_field_counts"].items()):
        print(f"  {field}: {count}")

    print("")
    print("Unmapped field names:")
    if plan["unmapped_field_names"]:
        for field, count in sorted(plan["unmapped_field_names"].items()):
            print(f"  {field}: {count}")
    else:
        print("  None")

    print("")
    print("Warnings/conflicts:")
    if plan["warnings_conflicts"]:
        for warning in plan["warnings_conflicts"][:40]:
            print(f"  - {warning}")
        remaining = len(plan["warnings_conflicts"]) - 40
        if remaining > 0:
            print(f"  ... {remaining} more")
    else:
        print("  None")

    print("")
    print("Sample inserts:")
    for item in plan["profiles_to_insert"][:10]:
        print(f"  + {item['profile_id']} ({item['display_name']})")
    if len(plan["profiles_to_insert"]) > 10:
        print(f"  ... {len(plan['profiles_to_insert']) - 10} more")

    print("")
    print("Sample updates:")
    for item in plan["profiles_to_update"][:10]:
        print(f"  * {item['profile_id']} ({item['display_name']}) <- {item['node_id']}")
    if len(plan["profiles_to_update"]) > 10:
        print(f"  ... {len(plan['profiles_to_update']) - 10} more")


def apply_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = DATA_DIR / f"people.pre_campaign_import_{timestamp}.json"
    report_path = DATA_DIR / f"campaign_import_report_{timestamp}.json"

    if MEMBER_PEOPLE_PATH.exists():
        shutil.copy2(MEMBER_PEOPLE_PATH, backup_path)
    else:
        write_json(backup_path, [])

    write_json(MEMBER_PEOPLE_PATH, plan["planned_profiles"])

    report = {key: value for key, value in plan.items() if key != "planned_profiles"}
    report["backup_path"] = str(backup_path)
    write_json(report_path, report)

    db.initialize_database()
    db.seed_people_cache_from_json()
    cache_count = len(db.list_people_cache())

    return {
        "member_profiles_after": len(plan["planned_profiles"]),
        "people_cache_after": cache_count,
        "backup_path": str(backup_path),
        "report_path": str(report_path),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import Campaign Command Center profiles into Member Command Center.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Inspect and summarize without changing files or database.")
    mode.add_argument("--apply", action="store_true", help="Apply the import to data/people.json and people_cache.")
    parser.add_argument("--campaign-root", default=str(DEFAULT_CAMPAIGN_ROOT), help="Path to Campaign Command Center.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    campaign_root = Path(args.campaign_root).resolve()
    plan = build_import_plan(campaign_root)

    if args.dry_run:
        print_summary(plan, "dry-run")
        return

    applied = apply_plan(plan)
    print_summary(plan, "apply", applied)


if __name__ == "__main__":
    main()
