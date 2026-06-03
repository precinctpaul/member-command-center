import html
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus, urlparse
from urllib.request import Request, urlopen


GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss/search"
DEFAULT_TIMEOUT_SECONDS = 25
DEFAULT_MAX_RESULTS = 20
DEFAULT_MAX_FEEDS = 3


class WebMentionsProfileError(ValueError):
    pass


class WebMentionsRequestError(RuntimeError):
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


def get_profile_name(person: Dict[str, Any]) -> str:
    return first_value(
        person.get("displayName"),
        person.get("name"),
        person.get("fullName"),
        nested_value(person, "identity", "fullName"),
        nested_value(person, "sourceIdentity", "displayName"),
    )


def get_office_context(person: Dict[str, Any]) -> str:
    title = first_value(
        person.get("title"),
        person.get("currentOffice"),
        nested_value(person, "office", "title"),
    )
    state = first_value(
        person.get("state"),
        person.get("stateCode"),
        nested_value(person, "office", "state"),
    )
    district = first_value(
        person.get("district"),
        person.get("districtLabel"),
        nested_value(person, "office", "district"),
    )

    return " ".join([part for part in [title, state, district] if part]).strip()


def get_domain(url: str) -> str:
    parsed = urlparse(str(url or "").strip())
    host = parsed.netloc.lower()

    if host.startswith("www."):
        host = host[4:]

    return host


def add_mapping_domain(value: str, domains: set) -> None:
    text = value.strip()

    if not text or text.startswith("@") or " " in text:
        return

    if not re.match(r"^https?://", text, flags=re.IGNORECASE):
        text = f"https://{text}"

    domain = get_domain(text)
    if domain:
        domains.add(domain)


def collect_domains_from_mapping(mapping: Dict[str, Any], domains: set) -> None:
    for value in mapping.values():
        if isinstance(value, str):
            add_mapping_domain(value, domains)
        elif isinstance(value, dict):
            collect_domains_from_mapping(value, domains)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    add_mapping_domain(item, domains)
                elif isinstance(item, dict):
                    collect_domains_from_mapping(item, domains)


def collect_self_owned_domains(person: Dict[str, Any]) -> List[str]:
    domains = set()

    for key in [
        "officialWebsite",
        "officialWebsiteUrl",
        "website",
        "websiteUrl",
        "campaignWebsite",
        "campaignWebsiteUrl",
        "contactForm",
        "contactFormUrl",
        "youtubeChannelUrl",
        "youtubeUrl",
    ]:
        value = person.get(key)
        if isinstance(value, str):
            add_mapping_domain(value, domains)

    for object_key in [
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
        value = person.get(object_key)
        if isinstance(value, dict):
            collect_domains_from_mapping(value, domains)

    return sorted(domains)


def is_self_owned_domain(domain: str, self_domains: List[str]) -> bool:
    clean_domain = str(domain or "").lower().strip()

    if not clean_domain:
        return False

    for self_domain in self_domains:
        if clean_domain == self_domain:
            return True

        if clean_domain.endswith(f".{self_domain}"):
            return True

    return False


def is_obvious_owned_or_social_domain(domain: str, self_domains: List[str]) -> bool:
    clean_domain = str(domain or "").lower().strip()

    social_domains = [
        "facebook.com",
        "instagram.com",
        "twitter.com",
        "x.com",
        "threads.net",
        "tiktok.com",
        "youtube.com",
        "youtu.be",
        "linkedin.com",
    ]

    if is_self_owned_domain(clean_domain, self_domains):
        return True

    return any(clean_domain == social_domain or clean_domain.endswith(f".{social_domain}") for social_domain in social_domains)


def build_search_queries(person: Dict[str, Any]) -> List[str]:
    name = get_profile_name(person)
    office_context = get_office_context(person)

    if not name:
        raise WebMentionsProfileError("This profile does not have a searchable display name.")

    queries = [
        f'"{name}"',
        f'"{name}" {office_context}'.strip(),
        f'"{name}" campaign',
    ]

    seen = set()
    normalized = []

    for query in queries:
        clean_query = " ".join(str(query).split()).strip()

        if clean_query and clean_query not in seen:
            seen.add(clean_query)
            normalized.append(clean_query)

    return normalized


def build_google_news_rss_url(query: str) -> str:
    encoded_query = quote_plus(query)

    return f"{GOOGLE_NEWS_RSS_BASE}?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"


def fetch_rss(url: str) -> str:
    request = Request(
        url,
        headers={
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
            "User-Agent": "MemberCommandCenter/1.6G-alt",
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
            return response.read().decode("utf-8", errors="replace")
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise WebMentionsRequestError(f"RSS request failed with HTTP {error.code}: {body[:300]}") from error
    except URLError as error:
        raise WebMentionsRequestError(f"RSS request failed: {error}") from error


def clean_text(value: Any) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def parse_date(value: str) -> str:
    raw = str(value or "").strip()

    if not raw:
        return ""

    try:
        parsed = parsedate_to_datetime(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")
    except Exception:
        return raw


def find_child_text(parent: ET.Element, tag_name: str) -> str:
    child = parent.find(tag_name)

    if child is None or child.text is None:
        return ""

    return clean_text(child.text)


def parse_google_news_items(xml_text: str, feed_url: str, query: str) -> List[Dict[str, Any]]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as error:
        raise WebMentionsRequestError(f"RSS XML parse failed: {error}") from error

    items = []

    for item in root.findall(".//item"):
        title = find_child_text(item, "title")
        link = find_child_text(item, "link")
        description = find_child_text(item, "description")
        published_date = parse_date(find_child_text(item, "pubDate"))

        source_element = item.find("source")
        source_name = ""
        source_url = ""

        if source_element is not None:
            source_name = clean_text(source_element.text or "")
            source_url = str(source_element.attrib.get("url") or "").strip()

        source_domain = get_domain(source_url) or get_domain(link)
        mention_type = classify_result(title=title, snippet=description, url=link)

        items.append(
            {
                "title": title,
                "url": link,
                "source_name": source_name,
                "source_url": source_url,
                "domain": source_domain,
                "snippet": description,
                "published_date": published_date,
                "mention_type": mention_type,
                "narrative_hook": build_narrative_hook(
                    title=title,
                    domain=source_domain,
                    mention_type=mention_type,
                ),
                "feed_url": feed_url,
                "search_query": query,
            }
        )

    return items


def classify_result(title: str, snippet: str, url: str) -> str:
    combined = f"{title} {snippet} {url}".lower()

    if any(term in combined for term in ["lawsuit", "investigation", "ethics", "scandal", "charged", "indicted"]):
        return "risk"

    if any(term in combined for term in ["wins", "announces", "delivers", "secures", "passes", "funding", "grant"]):
        return "positive"

    if any(term in combined for term in ["opponent", "challenger", "race", "campaign", "poll", "election", "primary"]):
        return "race_context"

    if any(term in combined for term in ["interview", "said", "statement", "press", "remarks"]):
        return "public_commentary"

    return "general_mention"


def build_narrative_hook(title: str, domain: str, mention_type: str) -> str:
    clean_title = clean_text(title)
    clean_domain = domain or "unknown source"

    if mention_type == "risk":
        return f"Review potential risk mention from {clean_domain}: {clean_title}"

    if mention_type == "positive":
        return f"Potential achievement/proof point from {clean_domain}: {clean_title}"

    if mention_type == "race_context":
        return f"Potential race-context clipping from {clean_domain}: {clean_title}"

    if mention_type == "public_commentary":
        return f"Potential quote/commentary clipping from {clean_domain}: {clean_title}"

    return f"General public mention from {clean_domain}: {clean_title}"


def dedupe_results(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    deduped = []

    for result in results:
        title = str(result.get("title") or "").strip().lower()
        domain = str(result.get("domain") or "").strip().lower()
        url = str(result.get("url") or "").strip().lower()
        key = url or f"{domain}:{title}"

        if not key or key in seen:
            continue

        seen.add(key)
        deduped.append(result)

    return deduped


def filter_external_results(results: List[Dict[str, Any]], self_domains: List[str]) -> List[Dict[str, Any]]:
    filtered = []

    for result in results:
        domain = str(result.get("domain") or "").strip().lower()

        if is_obvious_owned_or_social_domain(domain, self_domains):
            continue

        filtered.append(result)

    return filtered


def sort_results(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def sort_key(result: Dict[str, Any]) -> str:
        return str(result.get("published_date") or "")

    return sorted(results, key=sort_key, reverse=True)


def count_by_type(results: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    for result in results:
        mention_type = result.get("mention_type") or "general_mention"
        counts[mention_type] = counts.get(mention_type, 0) + 1

    return counts


def determine_run_status(raw_count: int, external_count: int, feed_errors: List[str]) -> str:
    if external_count > 0:
        return "completed"

    if raw_count > 0:
        return "partial"

    if feed_errors:
        return "failed"

    return "partial"


def build_summary(
    queries: List[str],
    feeds_attempted: List[str],
    feed_errors: List[str],
    self_domains: List[str],
    raw_results: List[Dict[str, Any]],
    external_results: List[Dict[str, Any]],
    max_results: int,
) -> Dict[str, Any]:
    domains = []

    for result in external_results:
        domain = result.get("domain")
        if domain and domain not in domains:
            domains.append(domain)

    narrative_hooks = [
        result.get("narrative_hook")
        for result in external_results
        if result.get("narrative_hook")
    ]

    return {
        "search_queries": queries,
        "feeds_attempted": feeds_attempted,
        "feed_errors": feed_errors,
        "max_results": max_results,
        "self_owned_domains_excluded": self_domains,
        "raw_results_returned": len(raw_results),
        "external_mentions_returned": len(external_results),
        "source_domains": domains,
        "mention_type_counts": count_by_type(external_results),
        "latest_published_date": first_value(*(result.get("published_date") for result in external_results)),
        "narrative_hooks": narrative_hooks[:max_results],
        "mentions": external_results[:max_results],
    }


def build_diagnostics(
    raw_results: List[Dict[str, Any]],
    external_results: List[Dict[str, Any]],
    self_domains: List[str],
    queries: List[str],
    feeds_attempted: List[str],
    feed_errors: List[str],
) -> Dict[str, Any]:
    return {
        "source_strategy": "google_news_rss",
        "queries": queries,
        "feeds_attempted_count": len(feeds_attempted),
        "feeds_attempted": feeds_attempted,
        "feed_errors": feed_errors,
        "raw_results_returned": len(raw_results),
        "external_mentions_returned": len(external_results),
        "excluded_self_owned_domains": self_domains,
        "excluded_self_owned_count": len(raw_results) - len(external_results),
        "mention_type_counts": count_by_type(external_results),
    }


def build_raw(
    raw_results: List[Dict[str, Any]],
    external_results: List[Dict[str, Any]],
    feeds_attempted: List[str],
    feed_errors: List[str],
) -> Dict[str, Any]:
    return {
        "feeds_attempted": feeds_attempted,
        "feed_errors": feed_errors,
        "raw_results": raw_results,
        "external_results": external_results,
    }


def build_web_mentions_run_payload(
    profile_id: str,
    person: Dict[str, Any],
    max_results: int = DEFAULT_MAX_RESULTS,
    max_feeds: int = DEFAULT_MAX_FEEDS,
) -> Dict[str, Any]:
    clean_profile_id = str(profile_id or "").strip()
    clean_max_results = max(1, min(int(max_results or DEFAULT_MAX_RESULTS), 50))
    clean_max_feeds = max(1, min(int(max_feeds or DEFAULT_MAX_FEEDS), 5))

    if not clean_profile_id:
        raise WebMentionsProfileError("profile_id is required.")

    queries = build_search_queries(person)[:clean_max_feeds]
    self_domains = collect_self_owned_domains(person)

    started_at = utc_now_iso()
    feeds_attempted = []
    feed_errors = []
    raw_results = []

    for query in queries:
        feed_url = build_google_news_rss_url(query)
        feeds_attempted.append(feed_url)

        try:
            xml_text = fetch_rss(feed_url)
            raw_results.extend(parse_google_news_items(xml_text, feed_url, query))
        except Exception as error:
            feed_errors.append(f"{query}: {error}")

    completed_at = utc_now_iso()

    raw_results = sort_results(dedupe_results(raw_results))
    external_results = sort_results(filter_external_results(raw_results, self_domains))[:clean_max_results]

    return {
        "run_id": f"web_mentions_rss_{clean_profile_id}_{uuid.uuid4().hex}",
        "profile_id": clean_profile_id,
        "module_name": "web_mentions",
        "run_status": determine_run_status(len(raw_results), len(external_results), feed_errors),
        "started_at": started_at,
        "completed_at": completed_at,
        "source_name": "Google News RSS",
        "source_url": GOOGLE_NEWS_RSS_BASE,
        "summary": build_summary(
            queries=queries,
            feeds_attempted=feeds_attempted,
            feed_errors=feed_errors,
            self_domains=self_domains,
            raw_results=raw_results,
            external_results=external_results,
            max_results=clean_max_results,
        ),
        "diagnostics": build_diagnostics(
            raw_results=raw_results,
            external_results=external_results,
            self_domains=self_domains,
            queries=queries,
            feeds_attempted=feeds_attempted,
            feed_errors=feed_errors,
        ),
        "raw": build_raw(
            raw_results=raw_results,
            external_results=external_results,
            feeds_attempted=feeds_attempted,
            feed_errors=feed_errors,
        ),
    }