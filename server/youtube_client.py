import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen


YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
YOUTUBE_WATCH_BASE = "https://www.youtube.com/watch"
YOUTUBE_CHANNEL_BASE = "https://www.youtube.com/channel"
DEFAULT_TIMEOUT_SECONDS = 25


class YouTubeProfileError(ValueError):
    pass


class YouTubeRequestError(RuntimeError):
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


def normalize_int(value: Any) -> Optional[int]:
    if value is None or str(value).strip() == "":
        return None

    try:
        return int(value)
    except ValueError:
        return None
    except TypeError:
        return None


def build_url(path: str, params: Dict[str, Any]) -> str:
    clean_path = path if path.startswith("/") else f"/{path}"
    cleaned_params = {
        key: value
        for key, value in params.items()
        if value is not None and str(value).strip() != ""
    }

    return f"{YOUTUBE_API_BASE}{clean_path}?{urlencode(cleaned_params)}"


def fetch_youtube_json(path: str, params: Dict[str, Any], timeout: int = DEFAULT_TIMEOUT_SECONDS) -> Dict[str, Any]:
    url = build_url(path, params)
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "MemberCommandCenter/1.6E",
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

        raise YouTubeRequestError(
            f"YouTube request failed for {path} with HTTP {error.code}: {body[:240]}"
        ) from error
    except URLError as error:
        raise YouTubeRequestError(f"YouTube request failed for {path}: {error}") from error
    except json.JSONDecodeError as error:
        raise YouTubeRequestError(f"YouTube returned invalid JSON for {path}: {error}") from error


def safe_fetch(label: str, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    try:
        value = fetch_youtube_json(path, params)
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


def get_items(api_response: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(api_response, dict):
        return []

    items = api_response.get("items")

    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]

    return []


def result_items(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not result.get("ok"):
        return []

    return get_items(result.get("value"))


def first_item(result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    items = result_items(result)
    return items[0] if items else None


def extract_channel_id_from_url(url: str) -> str:
    raw = str(url or "").strip()

    if not raw:
        return ""

    parsed = urlparse(raw)
    path = parsed.path.strip("/")

    if not path:
        return ""

    parts = path.split("/")

    if "youtube.com" in parsed.netloc or "youtu.be" in parsed.netloc:
        if len(parts) >= 2 and parts[0].lower() == "channel":
            return parts[1]

        query_values = parse_qs(parsed.query)
        if "channel_id" in query_values and query_values["channel_id"]:
            return query_values["channel_id"][0]

    return ""


def get_youtube_identity(person: Dict[str, Any]) -> Dict[str, str]:
    explicit_channel_id = first_value(
        person.get("youtubeChannelId"),
        nested_value(person, "ids", "youtubeChannelId"),
        nested_value(person, "identifiers", "youtubeChannelId"),
        nested_value(person, "sourceIdentity", "youtubeChannelId"),
        nested_value(person, "officialLinks", "youtubeChannelId"),
        nested_value(person, "media", "youtubeChannelId"),
        nested_value(person, "youtubeProofVideos", "channelId"),
    )

    channel_url = first_value(
        person.get("youtubeChannelUrl"),
        person.get("youtubeUrl"),
        nested_value(person, "officialLinks", "youtube"),
        nested_value(person, "officialLinks", "youtubeUrl"),
        nested_value(person, "officialLinks", "youtubeChannelUrl"),
        nested_value(person, "links", "youtube"),
        nested_value(person, "links", "youtubeUrl"),
        nested_value(person, "media", "youtubeChannelUrl"),
        nested_value(person, "youtubeProofVideos", "channelUrl"),
        nested_value(person, "social", "youtube"),
    )

    url_channel_id = extract_channel_id_from_url(channel_url)

    display_name = first_value(
        person.get("displayName"),
        person.get("name"),
        person.get("fullName"),
        nested_value(person, "identity", "fullName"),
    )

    state = first_value(person.get("state"), nested_value(person, "office", "state"))
    district = first_value(person.get("district"), nested_value(person, "office", "district"))
    title = first_value(person.get("title"), person.get("currentOffice"), nested_value(person, "office", "title"))

    search_query_parts = [display_name, title, state, district, "official YouTube"]
    search_query = " ".join([part for part in search_query_parts if part])

    return {
        "channel_id": explicit_channel_id or url_channel_id,
        "channel_url": channel_url,
        "search_query": search_query.strip(),
        "display_name": display_name,
    }


def search_channel(api_key: str, query: str) -> Dict[str, Any]:
    if not query:
        return skipped_result("Channel search", "/search", "No searchable name or channel ID was available.")

    return safe_fetch(
        "Channel search",
        "/search",
        {
            "key": api_key,
            "part": "snippet",
            "type": "channel",
            "maxResults": "5",
            "q": query,
        },
    )


def pick_channel_id(identity: Dict[str, str], search_result: Dict[str, Any]) -> str:
    if identity["channel_id"]:
        return identity["channel_id"]

    for item in result_items(search_result):
        item_id = item.get("id")

        if isinstance(item_id, dict):
            channel_id = item_id.get("channelId")
            if channel_id:
                return str(channel_id).strip()

    return ""


def get_channel_url(channel_id: str, fallback_url: str = "") -> str:
    if channel_id:
        return f"{YOUTUBE_CHANNEL_BASE}/{channel_id}"

    return fallback_url


def build_watch_url(video_id: str) -> str:
    return f"{YOUTUBE_WATCH_BASE}?v={video_id}"


def get_uploads_playlist_id(channel_detail: Optional[Dict[str, Any]]) -> str:
    if not isinstance(channel_detail, dict):
        return ""

    content_details = channel_detail.get("contentDetails")
    if not isinstance(content_details, dict):
        return ""

    related_playlists = content_details.get("relatedPlaylists")
    if not isinstance(related_playlists, dict):
        return ""

    return str(related_playlists.get("uploads") or "").strip()


def normalize_channel_detail(channel_detail: Optional[Dict[str, Any]], identity: Dict[str, str], channel_id: str) -> Dict[str, Any]:
    if not isinstance(channel_detail, dict):
        return {
            "channel_id": channel_id,
            "channel_title": "",
            "channel_url": get_channel_url(channel_id, identity.get("channel_url", "")),
            "description": "",
            "published_at": "",
            "subscriber_count": None,
            "view_count": None,
            "video_count": None,
            "hidden_subscriber_count": False,
            "uploads_playlist_id": "",
        }

    snippet = channel_detail.get("snippet") if isinstance(channel_detail.get("snippet"), dict) else {}
    statistics = channel_detail.get("statistics") if isinstance(channel_detail.get("statistics"), dict) else {}

    return {
        "channel_id": channel_id,
        "channel_title": first_value(snippet.get("title"), identity.get("display_name")),
        "channel_url": get_channel_url(channel_id, identity.get("channel_url", "")),
        "description": first_value(snippet.get("description")),
        "published_at": first_value(snippet.get("publishedAt")),
        "subscriber_count": normalize_int(statistics.get("subscriberCount")),
        "view_count": normalize_int(statistics.get("viewCount")),
        "video_count": normalize_int(statistics.get("videoCount")),
        "hidden_subscriber_count": str(statistics.get("hiddenSubscriberCount", "")).lower() == "true",
        "uploads_playlist_id": get_uploads_playlist_id(channel_detail),
    }


def normalize_video(item: Dict[str, Any]) -> Dict[str, Any]:
    snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
    content_details = item.get("contentDetails") if isinstance(item.get("contentDetails"), dict) else {}

    resource_id = snippet.get("resourceId") if isinstance(snippet.get("resourceId"), dict) else {}
    video_id = first_value(content_details.get("videoId"), resource_id.get("videoId"))

    return {
        "video_id": video_id,
        "title": first_value(snippet.get("title")),
        "description": first_value(snippet.get("description")),
        "published_at": first_value(snippet.get("publishedAt")),
        "channel_title": first_value(snippet.get("channelTitle")),
        "thumbnail_url": extract_thumbnail_url(snippet),
        "url": build_watch_url(video_id) if video_id else "",
    }


def extract_thumbnail_url(snippet: Dict[str, Any]) -> str:
    thumbnails = snippet.get("thumbnails")

    if not isinstance(thumbnails, dict):
        return ""

    for key in ["maxres", "standard", "high", "medium", "default"]:
        candidate = thumbnails.get(key)

        if isinstance(candidate, dict) and candidate.get("url"):
            return str(candidate["url"]).strip()

    return ""


def latest_upload_date(videos: List[Dict[str, Any]]) -> str:
    dates = [video.get("published_at") for video in videos if video.get("published_at")]
    return max(dates) if dates else ""


def diagnostic_status(result: Dict[str, Any]) -> str:
    if result.get("status") == "skipped":
        return f"skipped: {result.get('error') or 'not requested'}"

    if result.get("ok"):
        count = len(result_items(result))
        return f"ok: {count} item{'s' if count != 1 else ''}"

    return f"error: {result.get('error') or 'request failed'}"


def count_attempted(results: Dict[str, Dict[str, Any]]) -> int:
    return sum(1 for result in results.values() if result.get("status") != "skipped")


def count_successful(results: Dict[str, Dict[str, Any]]) -> int:
    return sum(1 for result in results.values() if result.get("status") == "ok" and result.get("ok"))


def determine_run_status(results: Dict[str, Dict[str, Any]], channel_id: str) -> str:
    channel_ok = results.get("channel_detail", {}).get("ok")
    uploads_ok = results.get("latest_videos", {}).get("ok")

    if channel_id and channel_ok and uploads_ok:
        return "completed"

    if channel_id and channel_ok:
        return "partial"

    if count_successful(results) > 0:
        return "partial"

    return "failed"


def trim_response(api_response: Optional[Dict[str, Any]], max_items: int = 5) -> Dict[str, Any]:
    if not isinstance(api_response, dict):
        return {}

    return {
        "etag": api_response.get("etag"),
        "kind": api_response.get("kind"),
        "pageInfo": api_response.get("pageInfo"),
        "items": get_items(api_response)[:max_items],
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


def build_diagnostics(results: Dict[str, Dict[str, Any]], identity: Dict[str, str], channel_id: str) -> Dict[str, Any]:
    return {
        "input_channel_id": identity.get("channel_id", ""),
        "input_channel_url": identity.get("channel_url", ""),
        "search_query": identity.get("search_query", ""),
        "resolved_channel_id": channel_id,
        "channel_search_status": diagnostic_status(results["channel_search"]),
        "channel_detail_status": diagnostic_status(results["channel_detail"]),
        "latest_videos_status": diagnostic_status(results["latest_videos"]),
        "attempted_requests": count_attempted(results),
        "successful_requests": count_successful(results),
    }


def build_summary(
    identity: Dict[str, str],
    channel_id: str,
    channel_detail: Dict[str, Any],
    videos: List[Dict[str, Any]],
    max_results: int,
) -> Dict[str, Any]:
    proof_links = [video["url"] for video in videos if video.get("url")]

    return {
        "input_channel_id": identity.get("channel_id", ""),
        "resolved_channel_id": channel_id,
        "channel_title": channel_detail.get("channel_title"),
        "channel_url": channel_detail.get("channel_url"),
        "description": channel_detail.get("description"),
        "subscriber_count": channel_detail.get("subscriber_count"),
        "hidden_subscriber_count": channel_detail.get("hidden_subscriber_count"),
        "view_count": channel_detail.get("view_count"),
        "video_count": channel_detail.get("video_count"),
        "latest_upload_date": latest_upload_date(videos),
        "latest_videos_returned": len(videos),
        "max_results": max_results,
        "proof_video_links": proof_links,
        "latest_videos": videos,
    }


def build_youtube_media_run_payload(
    profile_id: str,
    person: Dict[str, Any],
    api_key: str,
    max_results: int = 5,
) -> Dict[str, Any]:
    clean_profile_id = str(profile_id or "").strip()
    clean_api_key = str(api_key or "").strip()
    clean_max_results = max(1, min(int(max_results or 5), 25))

    if not clean_profile_id:
        raise YouTubeProfileError("profile_id is required.")

    if not clean_api_key:
        raise YouTubeProfileError("YOUTUBE_API_KEY is required.")

    identity = get_youtube_identity(person)

    if not identity["channel_id"] and not identity["search_query"]:
        raise YouTubeProfileError("This profile does not have a YouTube channel ID, channel URL, or searchable name.")

    results: Dict[str, Dict[str, Any]] = {
        "channel_search": skipped_result("Channel search", "/search", "Explicit channel ID was available.")
        if identity["channel_id"]
        else search_channel(clean_api_key, identity["search_query"]),
    }

    channel_id = pick_channel_id(identity, results["channel_search"])

    if not channel_id:
        raise YouTubeProfileError("Could not resolve a YouTube channel ID for this profile.")

    results["channel_detail"] = safe_fetch(
        "Channel detail",
        "/channels",
        {
            "key": clean_api_key,
            "part": "snippet,statistics,contentDetails",
            "id": channel_id,
            "maxResults": "1",
        },
    )

    channel_detail_item = first_item(results["channel_detail"])
    normalized_channel = normalize_channel_detail(channel_detail_item, identity, channel_id)
    uploads_playlist_id = normalized_channel.get("uploads_playlist_id") or ""

    results["latest_videos"] = safe_fetch(
        "Latest videos",
        "/playlistItems",
        {
            "key": clean_api_key,
            "part": "snippet,contentDetails",
            "playlistId": uploads_playlist_id,
            "maxResults": str(clean_max_results),
        },
    ) if uploads_playlist_id else skipped_result("Latest videos", "/playlistItems", "No uploads playlist ID was returned.")

    latest_videos = [normalize_video(item) for item in result_items(results["latest_videos"])]
    latest_videos = [video for video in latest_videos if video.get("video_id") or video.get("title")]

    started_at = utc_now_iso()
    completed_at = utc_now_iso()

    return {
        "run_id": f"youtube_{clean_profile_id}_{uuid.uuid4().hex}",
        "profile_id": clean_profile_id,
        "module_name": "youtube_media",
        "run_status": determine_run_status(results, channel_id),
        "started_at": started_at,
        "completed_at": completed_at,
        "source_name": "YouTube Data API",
        "source_url": YOUTUBE_API_BASE,
        "summary": build_summary(
            identity=identity,
            channel_id=channel_id,
            channel_detail=normalized_channel,
            videos=latest_videos,
            max_results=clean_max_results,
        ),
        "diagnostics": build_diagnostics(results, identity, channel_id),
        "raw": build_raw(results),
    }