from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


STATUS_VERIFIED = "verified"
STATUS_PARTIAL = "partial"
STATUS_MISSING = "missing"
STATUS_NEEDS_REVIEW = "needs_review"
STATUS_CONFLICTING = "conflicting"
STATUS_STALE = "stale"

PLACEHOLDER_VALUES = {
    "",
    "--",
    "-",
    "n/a",
    "na",
    "none",
    "null",
    "unknown",
    "not populated yet",
    "not started",
    "source needed",
    "source required",
    "state source required",
    "parser required",
    "missing_source",
    "source_needed",
    "not_loaded",
}

SCAFFOLD_MARKERS = [
    "required",
    "needed",
    "not populated",
    "not started",
    "scaffold",
    "eventually",
    "future",
    "seed profile",
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


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
        text = value.strip()
        return bool(text) and text.lower() not in PLACEHOLDER_VALUES
    if isinstance(value, list):
        return any(has_content(item) for item in value)
    if isinstance(value, dict):
        return any(has_content(item) for item in value.values())
    return True


def first_value(*values: Any) -> str:
    for value in values:
        if has_content(value):
            return str(value).strip()
    return ""


def first_url(*values: Any) -> str:
    for value in values:
        if not has_content(value):
            continue
        text = str(value).strip()
        if text.startswith(("http://", "https://")):
            return text
    return ""


def is_scaffold_text(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    text = value.strip().lower()
    return any(marker in text for marker in SCAFFOLD_MARKERS)


def latest_run_by_module(latest_runs: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    indexed: Dict[str, Dict[str, Any]] = {}
    for run in latest_runs:
        if not isinstance(run, dict):
            continue
        module_name = first_value(run.get("module_name"))
        if module_name:
            indexed[module_name] = run
    return indexed


def get_summary(run: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return as_dict(run.get("summary")) if isinstance(run, dict) else {}


def status_for_value(value: Any, source_backed: bool = False, needs_review: bool = False, conflicting: bool = False) -> str:
    if conflicting:
        return STATUS_CONFLICTING
    if not has_content(value):
        return STATUS_MISSING
    if needs_review or is_scaffold_text(value):
        return STATUS_NEEDS_REVIEW
    if source_backed:
        return STATUS_VERIFIED
    return STATUS_PARTIAL


def overall_status(statuses: List[str]) -> str:
    meaningful = [status for status in statuses if status]
    if not meaningful:
        return STATUS_MISSING
    if STATUS_CONFLICTING in meaningful:
        return STATUS_CONFLICTING
    if STATUS_NEEDS_REVIEW in meaningful:
        return STATUS_NEEDS_REVIEW
    if all(status == STATUS_MISSING for status in meaningful):
        return STATUS_MISSING
    if all(status in {STATUS_VERIFIED, STATUS_MISSING} for status in meaningful) and any(status == STATUS_VERIFIED for status in meaningful):
        return STATUS_PARTIAL if STATUS_MISSING in meaningful else STATUS_VERIFIED
    if any(status == STATUS_PARTIAL for status in meaningful):
        return STATUS_PARTIAL
    if any(status == STATUS_VERIFIED for status in meaningful):
        return STATUS_PARTIAL
    return STATUS_MISSING


def get_profile_name(person: Dict[str, Any], fallback: str = "") -> str:
    return first_value(
        person.get("displayName"),
        person.get("display_name"),
        person.get("name"),
        person.get("fullName"),
        nested_value(person, "identity", "fullName"),
        nested_value(person, "sourceIdentity", "displayName"),
        fallback,
    )


def get_profile_id(profile_id: str, person: Dict[str, Any]) -> str:
    return first_value(profile_id, person.get("id"), person.get("profile_id"), person.get("profileId"))


def get_source_tracking(person: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [item for item in as_list(person.get("sourceTracking")) if isinstance(item, dict) and has_content(item)]


def get_source_endpoints(person: Dict[str, Any]) -> Dict[str, Any]:
    return as_dict(person.get("sourceEndpoints"))


def source_tracking_matches(source_tracking: List[Dict[str, Any]], value: Any, source_type: str = "") -> bool:
    if not has_content(value):
        return False
    text = str(value).strip().rstrip("/")
    for item in source_tracking:
        item_value = first_value(item.get("value"), item.get("sourceUrl")).rstrip("/")
        item_type = first_value(item.get("type"), item.get("label")).lower()
        if item_value and (item_value == text or item_value.rstrip("/") == text):
            return True
        if source_type and source_type.lower() in item_type and has_content(item.get("sourceUrl")):
            return True
    return False


def official_web_reached(summary: Dict[str, Any], value: Any) -> bool:
    if not has_content(value):
        return False
    text = str(value).strip().rstrip("/")
    for row_key in ["reachable_urls", "checked_urls"]:
        for item in as_list(summary.get(row_key)):
            if not isinstance(item, dict):
                continue
            url = first_value(item.get("url"), item.get("final_url")).rstrip("/")
            if url and (url == text or url.rstrip("/") == text):
                return item.get("ok") is True or first_value(item.get("status")).lower() == "reachable"
    return False


def get_official_web_summary(latest_runs: List[Dict[str, Any]]) -> Dict[str, Any]:
    return get_summary(latest_run_by_module(latest_runs).get("official_web_contact"))


def has_campaign_import(person: Dict[str, Any]) -> bool:
    campaign_import = as_dict(person.get("campaignImport"))
    return has_content(campaign_import.get("nodeId")) or has_content(person.get("sourceNodeId"))


def source_backed_for_value(
    person: Dict[str, Any],
    latest_runs: List[Dict[str, Any]],
    value: Any,
    source_type: str = "",
) -> bool:
    if not has_content(value):
        return False
    source_tracking = get_source_tracking(person)
    if source_tracking_matches(source_tracking, value, source_type):
        return True
    if official_web_reached(get_official_web_summary(latest_runs), value):
        return True
    source_endpoints = get_source_endpoints(person)
    if any(str(endpoint_value).strip().rstrip("/") == str(value).strip().rstrip("/") for endpoint_value in source_endpoints.values() if has_content(endpoint_value)):
        return True
    return False


def collect_source_summary(person: Dict[str, Any], latest_runs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    seen = set()

    def add(label: str, value: Any, source_type: str, source_name: str = "", source_url: str = "", status: str = STATUS_VERIFIED) -> None:
        if not has_content(value):
            return
        key = (label, str(value), source_type)
        if key in seen:
            return
        seen.add(key)
        rows.append(
            {
                "label": label,
                "value": value,
                "type": source_type,
                "source_name": source_name,
                "source_url": source_url,
                "status": status,
            }
        )

    for item in get_source_tracking(person):
        add(
            first_value(item.get("label"), item.get("type"), "Source"),
            first_value(item.get("value"), item.get("sourceUrl")),
            first_value(item.get("type"), "source"),
            first_value(item.get("sourceName")),
            first_value(item.get("sourceUrl")),
            STATUS_VERIFIED if "needs" not in first_value(item.get("confidence")).lower() else STATUS_NEEDS_REVIEW,
        )

    for key, value in get_source_endpoints(person).items():
        add(key, value, "source-endpoint", "Profile sourceEndpoints", value)

    source_identity = as_dict(person.get("sourceIdentity"))
    for key, value in source_identity.items():
        if has_content(value):
            add(key, value, "source-identity", "Profile sourceIdentity", "")

    if has_campaign_import(person):
        add(
            "Campaign Command Center node",
            first_value(person.get("sourceNodeId"), nested_value(person, "campaignImport", "nodeId"), source_identity.get("campaignCommandCenterNodeId")),
            "import-provenance",
            "Campaign Command Center import",
            "",
        )

    for run in latest_runs:
        if not isinstance(run, dict):
            continue
        add(
            first_value(run.get("module_name"), "Source runner"),
            first_value(run.get("source_url"), run.get("run_id")),
            "runner",
            first_value(run.get("source_name")),
            first_value(run.get("source_url")),
            STATUS_VERIFIED if run.get("run_status") == "completed" else STATUS_PARTIAL,
        )

    return rows


def build_canonical_identity(person: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "full_name": first_value(person.get("fullName"), person.get("displayName"), person.get("name")),
        "preferred_name": first_value(person.get("preferredName"), person.get("displayName"), person.get("name")),
        "title": first_value(person.get("title"), person.get("officeTitle"), person.get("currentOffice"), nested_value(person, "office", "title")),
        "office": first_value(person.get("currentOffice"), person.get("office"), person.get("title"), nested_value(person, "raceContext", "office")),
        "state": first_value(person.get("state"), person.get("stateCode"), nested_value(person, "office", "state"), nested_value(person, "politicalGeography", "state")),
        "district": first_value(person.get("district"), person.get("districtLabel"), nested_value(person, "office", "district"), nested_value(person, "politicalGeography", "district")),
        "jurisdiction": first_value(person.get("jurisdiction"), person.get("chamber"), nested_value(person, "office", "jurisdiction")),
        "party": first_value(person.get("party"), nested_value(person, "identity", "party"), nested_value(person, "sourceIdentity", "party")),
        "roster_group": first_value(person.get("rosterGroupName"), person.get("group")),
        "category": first_value(person.get("category"), person.get("rosterGroupName"), person.get("group")),
    }


def build_biography(person: Dict[str, Any], latest_runs: List[Dict[str, Any]]) -> Dict[str, Any]:
    bio = person.get("bio")
    bio_dict = as_dict(bio)
    short_bio = first_value(person.get("shortBio"), bio_dict.get("short"), bio_dict.get("shortBio"), bio_dict.get("standard"))
    medium_bio = first_value(bio_dict.get("standard"), bio_dict.get("medium"), person.get("officialBio"), bio_dict.get("official"))
    long_bio = first_value(bio_dict.get("long"), person.get("longBio"))
    one_line = first_value(bio_dict.get("oneLine"), bio_dict.get("headline"), person.get("oneLineBio"))
    source_url = first_url(person.get("bioSource"), nested_value(person, "sourceEndpoints", "bioSource"))
    source_backed = bool(source_url) or source_tracking_matches(get_source_tracking(person), short_bio or medium_bio or one_line, "bio")
    status = status_for_value(first_value(short_bio, medium_bio, long_bio, one_line), source_backed=source_backed)
    return {
        "short_bio": short_bio,
        "medium_bio": medium_bio,
        "long_bio": long_bio,
        "one_line": one_line,
        "status": status,
        "source_url": source_url,
        "last_verified_at": None,
    }


def build_headshots(person: Dict[str, Any], latest_runs: List[Dict[str, Any]]) -> Dict[str, Any]:
    headshot = as_dict(person.get("headshot"))
    primary_url = first_url(person.get("headshotUrl"), person.get("photoUrl"), headshot.get("primaryUrl"), nested_value(person, "media", "headshotUrl"))
    source = first_value(headshot.get("source"), nested_value(person, "media", "headshotSource"))
    alt_text = first_value(headshot.get("altText"), nested_value(person, "media", "altText"))
    source_backed = bool(first_url(source)) or source_backed_for_value(person, latest_runs, primary_url, "headshot")
    return {
        "primary_url": primary_url,
        "source": source,
        "alt_text": alt_text,
        "status": status_for_value(primary_url, source_backed=source_backed),
    }


def build_links(person: Dict[str, Any], latest_runs: List[Dict[str, Any]]) -> Dict[str, Any]:
    official_links = as_dict(person.get("officialLinks"))
    source_identity = as_dict(person.get("sourceIdentity"))
    official_summary = get_official_web_summary(latest_runs)
    official_website = first_url(official_summary.get("primary_official_url"), person.get("officialWebsite"), official_links.get("officialWebsite"))
    campaign_website = first_url(official_summary.get("primary_campaign_url"), person.get("campaignWebsite"), official_links.get("campaignWebsite"))
    congress_profile = first_url(person.get("congressGovUrl"), official_links.get("congressGovProfile"), nested_value(person, "legislativeMechanics", "congressGovUrl"), nested_value(person, "sourceEndpoints", "congressGovProfile"))
    openstates_profile = first_url(source_identity.get("openStatesProfile"), official_links.get("openStatesProfile"), nested_value(person, "legislativeMechanics", "openStatesUrl"), nested_value(person, "sourceEndpoints", "openStatesProfile"))
    fec_profile = first_url(person.get("fecProfile"), nested_value(person, "campaignFinanceSnapshot", "fecProfile"), nested_value(person, "campaignFinanceSnapshot", "sourceUrl"), nested_value(person, "sourceEndpoints", "financeSource"))
    link_values = [
        (official_website, "official"),
        (campaign_website, "campaign"),
        (congress_profile, "federal-legislative"),
        (openstates_profile, "state-legislative"),
        (fec_profile, "campaign-finance"),
    ]
    backed_values = [
        source_backed_for_value(person, latest_runs, value, source_type)
        for value, source_type in link_values
        if value
    ]
    status = STATUS_MISSING
    if any(value for value, _source_type in link_values):
        status = STATUS_VERIFIED if backed_values and all(backed_values) else STATUS_PARTIAL
    return {
        "official_website": official_website,
        "campaign_website": campaign_website,
        "congress_gov_profile": congress_profile,
        "openstates_profile": openstates_profile,
        "fec_profile": fec_profile,
        "status": status,
    }


def build_socials(person: Dict[str, Any], latest_runs: List[Dict[str, Any]]) -> Dict[str, Any]:
    social = as_dict(person.get("social"))
    official_links = as_dict(person.get("officialLinks"))
    media_tracking = as_dict(person.get("mediaTracking"))
    web_handles = as_list(person.get("webHandles"))
    handle_map: Dict[str, str] = {}
    for item in web_handles:
        if not isinstance(item, dict):
            continue
        label = first_value(item.get("label")).lower()
        value = first_value(item.get("value"))
        if "twitter" in label or label == "x":
            handle_map["x"] = value
        elif "facebook" in label:
            handle_map["facebook"] = value
        elif "instagram" in label:
            handle_map["instagram"] = value
        elif "thread" in label:
            handle_map["threads"] = value
        elif "youtube" in label:
            handle_map["youtube"] = value
        elif "tiktok" in label:
            handle_map["tiktok"] = value
        elif "bluesky" in label:
            handle_map["bluesky"] = value
        elif "linkedin" in label:
            handle_map["linkedin"] = value
    values = {
        "x": first_value(person.get("xUrl"), person.get("twitterUrl"), social.get("x"), social.get("twitter"), handle_map.get("x")),
        "facebook": first_value(person.get("facebookUrl"), social.get("facebook"), handle_map.get("facebook")),
        "instagram": first_value(person.get("instagramUrl"), social.get("instagram"), handle_map.get("instagram")),
        "threads": first_value(social.get("threads"), handle_map.get("threads")),
        "youtube": first_value(person.get("youtubeUrl"), social.get("youtube"), official_links.get("youtubeChannelId"), official_links.get("youtubeChannelTitle"), media_tracking.get("youtubeChannelId"), handle_map.get("youtube")),
        "tiktok": first_value(social.get("tiktok"), handle_map.get("tiktok")),
        "bluesky": first_value(social.get("bluesky"), handle_map.get("bluesky")),
        "linkedin": first_value(social.get("linkedin"), handle_map.get("linkedin")),
    }
    social_present = any(has_content(value) for value in values.values())
    source_backed = any(source_tracking_matches(get_source_tracking(person), value, "social") for value in values.values() if has_content(value))
    status = STATUS_MISSING
    if social_present:
        status = STATUS_VERIFIED if source_backed else STATUS_NEEDS_REVIEW
    return {**values, "status": status}


def build_brand_assets(person: Dict[str, Any]) -> Dict[str, Any]:
    brand = as_dict(person.get("brandAssets"))
    assets = as_dict(person.get("assets"))
    logos = as_list(brand.get("logos")) or as_list(assets.get("logos"))
    fonts = as_list(brand.get("fonts"))
    colors = as_list(brand.get("colors"))
    templates = as_list(brand.get("templates"))
    photo_folders = as_list(brand.get("photoFolders"))
    video_folders = as_list(brand.get("videoFolders"))
    press_kit_links = as_list(brand.get("pressKitLinks"))
    usage_notes = as_list(brand.get("usageNotes"))
    headshot_usage_note = first_value(nested_value(person, "headshot", "usageNote"))
    if headshot_usage_note:
        usage_notes.append(headshot_usage_note)
    has_asset = any([logos, fonts, colors, templates, photo_folders, video_folders, press_kit_links])
    return {
        "logos": logos,
        "fonts": fonts,
        "colors": colors,
        "templates": templates,
        "photo_folders": photo_folders,
        "video_folders": video_folders,
        "press_kit_links": press_kit_links,
        "usage_notes": usage_notes,
        "status": STATUS_PARTIAL if has_asset else STATUS_MISSING,
    }


def build_verification(
    canonical_identity: Dict[str, Any],
    biography: Dict[str, Any],
    headshots: Dict[str, Any],
    links: Dict[str, Any],
    socials: Dict[str, Any],
    brand_assets: Dict[str, Any],
    source_summary: List[Dict[str, Any]],
) -> Dict[str, Any]:
    missing_core_fields = []
    core_fields = {
        "display_name": canonical_identity.get("full_name"),
        "title": canonical_identity.get("title"),
        "office": canonical_identity.get("office"),
        "state_or_jurisdiction": first_value(canonical_identity.get("state"), canonical_identity.get("jurisdiction")),
        "roster_group_or_category": first_value(canonical_identity.get("roster_group"), canonical_identity.get("category")),
        "bio": first_value(biography.get("short_bio"), biography.get("medium_bio"), biography.get("one_line")),
        "headshot": headshots.get("primary_url"),
        "official_website": links.get("official_website"),
    }
    for field, value in core_fields.items():
        if not has_content(value):
            missing_core_fields.append(field)

    status_by_section = {
        "biography": biography.get("status"),
        "headshots": headshots.get("status"),
        "links": links.get("status"),
        "socials": socials.get("status"),
        "brand_assets": brand_assets.get("status"),
    }
    needs_review_fields = [
        key
        for key, status in status_by_section.items()
        if status in {STATUS_NEEDS_REVIEW, STATUS_PARTIAL}
    ]
    official_source_count = sum(1 for item in source_summary if "official" in first_value(item.get("type"), item.get("label")).lower())
    return {
        "overall_status": overall_status(list(status_by_section.values())),
        "source_count": len(source_summary),
        "official_source_count": official_source_count,
        "missing_core_fields": missing_core_fields,
        "needs_review_fields": needs_review_fields,
        "conflicting_fields": [],
        "last_verified_at": None,
        "source_summary": source_summary[:20],
    }


def build_canonical_profile(profile_id: str, person: Dict[str, Any], latest_runs: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    runs = latest_runs if isinstance(latest_runs, list) else []
    clean_profile_id = get_profile_id(profile_id, person)
    display_name = get_profile_name(person, clean_profile_id)
    canonical_identity = build_canonical_identity(person)
    biography = build_biography(person, runs)
    headshots = build_headshots(person, runs)
    links = build_links(person, runs)
    socials = build_socials(person, runs)
    brand_assets = build_brand_assets(person)
    source_summary = collect_source_summary(person, runs)
    verification = build_verification(canonical_identity, biography, headshots, links, socials, brand_assets, source_summary)

    return {
        "profile_id": clean_profile_id,
        "display_name": display_name,
        "generated_at": utc_now_iso(),
        "canonical_identity": canonical_identity,
        "biography": biography,
        "headshots": headshots,
        "links": links,
        "socials": socials,
        "brand_assets": brand_assets,
        "verification": verification,
    }


def compact_canonical_profile(record: Dict[str, Any]) -> Dict[str, Any]:
    verification = as_dict(record.get("verification"))
    identity = as_dict(record.get("canonical_identity"))
    return {
        "profile_id": record.get("profile_id"),
        "display_name": record.get("display_name"),
        "title": identity.get("title"),
        "state": identity.get("state"),
        "district": identity.get("district"),
        "roster_group": identity.get("roster_group"),
        "overall_status": verification.get("overall_status"),
        "source_count": verification.get("source_count"),
        "missing_core_fields": verification.get("missing_core_fields", []),
        "needs_review_fields": verification.get("needs_review_fields", []),
    }
