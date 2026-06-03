import re
import socket
import ssl
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


DEFAULT_TIMEOUT_SECONDS = 10
USER_AGENT = "MemberCommandCenter/1.6F"


class OfficialWebProfileError(ValueError):
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


def looks_like_url(value: Any) -> bool:
    text = str(value or "").strip()

    if not text:
        return False

    if text.startswith("mailto:") or text.startswith("tel:"):
        return True

    if text.startswith("@"):
        return False

    if any(character.isspace() for character in text):
        return False

    if re.match(r"^https?://", text, flags=re.IGNORECASE):
        return True

    if text.lower().startswith("www."):
        return True

    parsed = urlparse(f"https://{text}")
    host = parsed.netloc.lower()

    if "." not in host:
        return False

    if host.endswith(".") or host.startswith("."):
        return False

    return True


def normalize_url(value: Any) -> str:
    text = str(value or "").strip()

    if not looks_like_url(text):
        return ""

    if text.startswith("mailto:") or text.startswith("tel:"):
        return text

    if not re.match(r"^https?://", text, flags=re.IGNORECASE):
        text = f"https://{text}"

    return text


def classify_url(label: str, url: str) -> str:
    lower_label = label.lower()
    lower_url = url.lower()

    if "campaign" in lower_label or "campaign" in lower_url:
        return "campaign"

    if "contact" in lower_label or "/contact" in lower_url or "contact" in lower_url:
        return "contact"

    if "donate" in lower_label or "actblue" in lower_url or "secure.actblue" in lower_url:
        return "donation"

    if any(
        domain in lower_url
        for domain in [
            "facebook.com",
            "instagram.com",
            "twitter.com",
            "x.com",
            "threads.net",
            "tiktok.com",
            "youtube.com",
            "youtu.be",
            "vimeo.com",
            "linkedin.com",
        ]
    ):
        return "social"

    if any(domain in lower_url for domain in [".house.gov", ".senate.gov", ".gov"]):
        return "official"

    if "official" in lower_label:
        return "official"

    return "web"


def collect_urls_from_mapping(mapping: Dict[str, Any], prefix: str = "") -> List[Dict[str, str]]:
    records: List[Dict[str, str]] = []

    for key, value in mapping.items():
        label = f"{prefix} {key}".strip()

        if isinstance(value, str):
            url = normalize_url(value)

            if url:
                records.append(
                    {
                        "label": label,
                        "url": url,
                        "category": classify_url(label, url),
                    }
                )
        elif isinstance(value, dict):
            records.extend(collect_urls_from_mapping(value, label))
        elif isinstance(value, list):
            for index, item in enumerate(value):
                item_label = f"{label} {index + 1}"

                if isinstance(item, str):
                    url = normalize_url(item)

                    if url:
                        records.append(
                            {
                                "label": item_label,
                                "url": url,
                                "category": classify_url(item_label, url),
                            }
                        )
                elif isinstance(item, dict):
                    records.extend(collect_urls_from_mapping(item, item_label))

    return records


def collect_candidate_urls(person: Dict[str, Any]) -> List[Dict[str, str]]:
    records: List[Dict[str, str]] = []

    explicit_fields = [
        ("Official website", person.get("officialWebsite")),
        ("Official website", person.get("officialWebsiteUrl")),
        ("Website", person.get("website")),
        ("Website URL", person.get("websiteUrl")),
        ("Campaign website", person.get("campaignWebsite")),
        ("Campaign website", person.get("campaignWebsiteUrl")),
        ("Contact form", person.get("contactForm")),
        ("Contact form", person.get("contactFormUrl")),
        ("Donation link", person.get("donateUrl")),
        ("ActBlue", person.get("actBlueUrl")),
        ("Facebook", person.get("facebookUrl")),
        ("Instagram", person.get("instagramUrl")),
        ("X", person.get("xUrl")),
        ("Twitter", person.get("twitterUrl")),
        ("Threads", person.get("threadsUrl")),
        ("TikTok", person.get("tiktokUrl")),
        ("YouTube", person.get("youtubeUrl")),
        ("YouTube channel", person.get("youtubeChannelUrl")),
        ("Vimeo", person.get("vimeoUrl")),
        ("LinkedIn", person.get("linkedinUrl")),
        ("Official website", nested_value(person, "officialLinks", "officialWebsite")),
        ("Official website", nested_value(person, "officialLinks", "website")),
        ("Campaign website", nested_value(person, "officialLinks", "campaignWebsite")),
        ("Contact form", nested_value(person, "officialLinks", "contactForm")),
        ("Facebook", nested_value(person, "officialLinks", "facebook")),
        ("Instagram", nested_value(person, "officialLinks", "instagram")),
        ("X", nested_value(person, "officialLinks", "x")),
        ("Twitter", nested_value(person, "officialLinks", "twitter")),
        ("Threads", nested_value(person, "officialLinks", "threads")),
        ("TikTok", nested_value(person, "officialLinks", "tiktok")),
        ("YouTube", nested_value(person, "officialLinks", "youtube")),
        ("Vimeo", nested_value(person, "officialLinks", "vimeo")),
        ("LinkedIn", nested_value(person, "officialLinks", "linkedin")),
        ("Donation link", nested_value(person, "officialLinks", "donate")),
        ("ActBlue", nested_value(person, "officialLinks", "actBlue")),
        ("Official website", nested_value(person, "officialLinksAndContact", "officialWebsite")),
        ("Campaign website", nested_value(person, "officialLinksAndContact", "campaignWebsite")),
        ("Contact form", nested_value(person, "officialLinksAndContact", "contactForm")),
        ("Campaign website", nested_value(person, "raceContext", "campaignWebsite")),
        ("Opponent website", nested_value(person, "raceContext", "opponentWebsite")),
        ("YouTube", nested_value(person, "youtubeProofVideos", "channelUrl")),
        ("YouTube", nested_value(person, "media", "youtubeChannelUrl")),
    ]

    for label, value in explicit_fields:
        url = normalize_url(value)

        if url:
            records.append(
                {
                    "label": label,
                    "url": url,
                    "category": classify_url(label, url),
                }
            )

    for key in [
        "officialLinks",
        "officialLinksAndContact",
        "links",
        "social",
        "socialLinks",
        "media",
        "web",
        "contact",
        "raceContext",
    ]:
        value = person.get(key)

        if isinstance(value, dict):
            records.extend(collect_urls_from_mapping(value, key))

    return dedupe_url_records(records)


def dedupe_url_records(records: List[Dict[str, str]]) -> List[Dict[str, str]]:
    seen = set()
    deduped = []

    for record in records:
        url = normalize_url(record.get("url"))

        if not url:
            continue

        key = url.lower().rstrip("/")

        if key in seen:
            continue

        seen.add(key)
        deduped.append(
            {
                "label": record.get("label") or "URL",
                "url": url,
                "category": record.get("category") or classify_url(record.get("label") or "", url),
            }
        )

    return deduped


def check_non_http_url(record: Dict[str, str]) -> Dict[str, Any]:
    url = record["url"]
    scheme = url.split(":", 1)[0].lower()

    return {
        **record,
        "ok": True,
        "status": "verified_scheme",
        "status_code": None,
        "final_url": url,
        "scheme": scheme,
        "content_type": "",
        "response_time_ms": None,
        "redirected": False,
        "error": "",
    }


def check_http_url(record: Dict[str, str], timeout_seconds: int) -> Dict[str, Any]:
    url = record["url"]
    start_time = time.perf_counter()

    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            response_time_ms = round((time.perf_counter() - start_time) * 1000)
            status_code = int(getattr(response, "status", 0) or 0)
            final_url = response.geturl()
            content_type = response.headers.get("Content-Type", "")

            return {
                **record,
                "ok": 200 <= status_code < 400,
                "status": "reachable" if 200 <= status_code < 400 else "unexpected_status",
                "status_code": status_code,
                "final_url": final_url,
                "scheme": urlparse(final_url).scheme,
                "content_type": content_type,
                "response_time_ms": response_time_ms,
                "redirected": final_url.rstrip("/") != url.rstrip("/"),
                "error": "",
            }
    except HTTPError as error:
        response_time_ms = round((time.perf_counter() - start_time) * 1000)
        final_url = getattr(error, "url", url)

        return {
            **record,
            "ok": 200 <= int(error.code) < 400,
            "status": "http_error",
            "status_code": int(error.code),
            "final_url": final_url,
            "scheme": urlparse(final_url).scheme,
            "content_type": error.headers.get("Content-Type", "") if error.headers else "",
            "response_time_ms": response_time_ms,
            "redirected": final_url.rstrip("/") != url.rstrip("/"),
            "error": str(error),
        }
    except (URLError, socket.timeout, TimeoutError, ssl.SSLError, ValueError) as error:
        response_time_ms = round((time.perf_counter() - start_time) * 1000)

        return {
            **record,
            "ok": False,
            "status": "request_failed",
            "status_code": None,
            "final_url": url,
            "scheme": urlparse(url).scheme,
            "content_type": "",
            "response_time_ms": response_time_ms,
            "redirected": False,
            "error": str(error),
        }


def check_url(record: Dict[str, str], timeout_seconds: int) -> Dict[str, Any]:
    url = record["url"]

    if url.startswith("mailto:") or url.startswith("tel:"):
        return check_non_http_url(record)

    return check_http_url(record, timeout_seconds)


def count_by_category(records: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    for record in records:
        category = record.get("category") or "web"
        counts[category] = counts.get(category, 0) + 1

    return counts


def determine_run_status(checked_urls: List[Dict[str, Any]]) -> str:
    if not checked_urls:
        return "failed"

    reachable = sum(1 for item in checked_urls if item.get("ok"))
    failed = len(checked_urls) - reachable

    if reachable == len(checked_urls):
        return "completed"

    if reachable > 0 and failed > 0:
        return "partial"

    return "failed"


def build_summary(checked_urls: List[Dict[str, Any]], timeout_seconds: int) -> Dict[str, Any]:
    reachable = [item for item in checked_urls if item.get("ok")]
    failed = [item for item in checked_urls if not item.get("ok")]
    redirected = [item for item in checked_urls if item.get("redirected")]

    official_urls = [item for item in checked_urls if item.get("category") == "official"]
    campaign_urls = [item for item in checked_urls if item.get("category") == "campaign"]
    contact_urls = [item for item in checked_urls if item.get("category") == "contact"]
    social_urls = [item for item in checked_urls if item.get("category") == "social"]

    return {
        "urls_checked": len(checked_urls),
        "reachable_count": len(reachable),
        "failed_count": len(failed),
        "redirected_count": len(redirected),
        "timeout_seconds": timeout_seconds,
        "category_counts": count_by_category(checked_urls),
        "official_url_count": len(official_urls),
        "campaign_url_count": len(campaign_urls),
        "contact_url_count": len(contact_urls),
        "social_url_count": len(social_urls),
        "primary_official_url": first_value(*(item.get("final_url") or item.get("url") for item in official_urls)),
        "primary_campaign_url": first_value(*(item.get("final_url") or item.get("url") for item in campaign_urls)),
        "primary_contact_url": first_value(*(item.get("final_url") or item.get("url") for item in contact_urls)),
        "reachable_urls": reachable,
        "failed_urls": failed,
        "redirected_urls": redirected,
    }


def build_diagnostics(candidate_urls: List[Dict[str, str]], checked_urls: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "candidate_urls_found": len(candidate_urls),
        "urls_checked": len(checked_urls),
        "reachable_count": sum(1 for item in checked_urls if item.get("ok")),
        "failed_count": sum(1 for item in checked_urls if not item.get("ok")),
        "categories": count_by_category(checked_urls),
    }


def build_raw(candidate_urls: List[Dict[str, str]], checked_urls: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "candidate_urls": candidate_urls,
        "checked_urls": checked_urls,
    }


def build_official_web_contact_run_payload(
    profile_id: str,
    person: Dict[str, Any],
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    clean_profile_id = str(profile_id or "").strip()
    clean_timeout_seconds = max(3, min(int(timeout_seconds or DEFAULT_TIMEOUT_SECONDS), 30))

    if not clean_profile_id:
        raise OfficialWebProfileError("profile_id is required.")

    candidate_urls = collect_candidate_urls(person)

    if not candidate_urls:
        raise OfficialWebProfileError("No official, campaign, contact, social, or media URLs were found on this profile.")

    started_at = utc_now_iso()
    checked_urls = [check_url(record, clean_timeout_seconds) for record in candidate_urls]
    completed_at = utc_now_iso()

    return {
        "run_id": f"official_web_{clean_profile_id}_{uuid.uuid4().hex}",
        "profile_id": clean_profile_id,
        "module_name": "official_web_contact",
        "run_status": determine_run_status(checked_urls),
        "started_at": started_at,
        "completed_at": completed_at,
        "source_name": "Official Web + Contact Verification",
        "source_url": "",
        "summary": build_summary(checked_urls, clean_timeout_seconds),
        "diagnostics": build_diagnostics(candidate_urls, checked_urls),
        "raw": build_raw(candidate_urls, checked_urls),
    }