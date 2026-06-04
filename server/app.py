import json
import mimetypes
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, unquote, urlparse

import congress_client
import db
import hydration_audit_client
import official_web_client
import openfec_client
import openstates_client
import race_context_client
import source_coverage_client
import strategic_briefing_client
import web_mentions_client
import youtube_client


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8081


API_KEY_DEFINITIONS: List[Dict[str, str]] = [
    {"key_name": "POLICYNOTE_API_KEY", "service_name": "PolicyNote", "category": "policy_legislative_data", "required_for": "PolicyNote people/entity lookup and policy intelligence enrichment"},
    {"key_name": "GEMINI_API_KEY", "service_name": "Google Gemini", "category": "ai", "required_for": "AI summarization, extraction, classification, and drafting workflows"},
    {"key_name": "CONGRESS_API_KEY", "service_name": "Congress.gov", "category": "federal_legislative", "required_for": "Federal bills, sponsored legislation, cosponsored legislation, member data, and legislative actions"},
    {"key_name": "OPENSTATES_API_KEY", "service_name": "OpenStates", "category": "state_legislative", "required_for": "State legislators, bills, votes, committees, and jurisdiction-level legislative data"},
    {"key_name": "GOVINFO_API_KEY", "service_name": "GovInfo", "category": "federal_documents", "required_for": "Federal documents, packages, committee prints, Congressional Record, and official publications"},
    {"key_name": "LEGISCAN_API_KEY", "service_name": "LegiScan", "category": "state_legislative", "required_for": "State bill tracking, legislative status, sponsors, and vote/event metadata"},
    {"key_name": "FEC_API_KEY", "service_name": "OpenFEC", "category": "campaign_finance", "required_for": "Federal campaign finance, committee totals, filings, debts, loans, spending, and receipts"},
    {"key_name": "GOOGLE_CIVIC_API_KEY", "service_name": "Google Civic Information API", "category": "civic_election", "required_for": "Election information, representatives, polling places, and civic geography lookups"},
    {"key_name": "GOOGLE_FACT_CHECK_API_KEY", "service_name": "Google Fact Check Tools API", "category": "fact_checking", "required_for": "Fact-check claim search and public claim verification tracking"},
    {"key_name": "GOOGLE_CUSTOM_SEARCH_API_KEY", "service_name": "Google Custom Search API", "category": "web_search", "required_for": "Public mentions, web clippings, article discovery, image search, and open web monitoring"},
    {"key_name": "GOOGLE_KNOWLEDGE_GRAPH_API_KEY", "service_name": "Google Knowledge Graph API", "category": "identity", "required_for": "Entity disambiguation, knowledge graph IDs, and public identity enrichment"},
    {"key_name": "GOOGLE_CUSTOM_SEARCH_ENGINE_ID", "service_name": "Google Custom Search Engine", "category": "web_search", "required_for": "Configured custom search engine ID used with Google Custom Search"},
    {"key_name": "YOUTUBE_API_KEY", "service_name": "YouTube Data API", "category": "media_video", "required_for": "YouTube channel stats, latest videos, channel discovery, and video proof monitoring"},
    {"key_name": "VIMEO_CHANNEL_URL", "service_name": "Vimeo", "category": "media_video", "required_for": "Vimeo channel/source URL for sync and video inventory workflows"},
    {"key_name": "VIMEO_ACCESS_TOKEN", "service_name": "Vimeo API", "category": "media_video", "required_for": "Authenticated Vimeo API access"},
    {"key_name": "VIMEO_USER_ID", "service_name": "Vimeo API", "category": "media_video", "required_for": "Vimeo user-level sync and account identification"},
    {"key_name": "VIMEO_SYNC_ON_START", "service_name": "Vimeo Sync", "category": "media_video", "required_for": "Local setting to determine whether Vimeo sync should run when backend starts"},
    {"key_name": "MODECK_API_KEY", "service_name": "MoDeck", "category": "creative_automation", "required_for": "MoDeck render/package automation"},
    {"key_name": "MODECK_API_BASE_URL", "service_name": "MoDeck", "category": "creative_automation", "required_for": "MoDeck API base URL"},
    {"key_name": "MODECK_DEFAULT_DECK", "service_name": "MoDeck", "category": "creative_automation", "required_for": "Default MoDeck deck/template target"},
]


def load_dotenv() -> None:
    env_path = Path(__file__).resolve().parent / ".env"

    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key and key not in os.environ:
            os.environ[key] = value


def preview_secret(value: str) -> str:
    text = str(value or "")

    if len(text) <= 6:
        return "***"

    return f"{text[:3]}...{text[-3:]}"


def get_api_key_status() -> Dict[str, Any]:
    records = []

    for definition in API_KEY_DEFINITIONS:
        key_name = definition["key_name"]
        raw_value = os.environ.get(key_name, "")
        is_configured = bool(str(raw_value).strip())

        records.append(
            {
                **definition,
                "is_configured": is_configured,
                "value_preview": preview_secret(raw_value) if is_configured else "",
            }
        )

    configured_count = sum(1 for record in records if record["is_configured"])

    return {
        "total_keys": len(records),
        "configured_keys": configured_count,
        "missing_keys": len(records) - configured_count,
        "records": records,
    }


def first_query_value(query: Dict[str, List[str]], key: str) -> str:
    values = query.get(key) or []
    return values[0] if values else ""


def first_payload_value(payload: Dict[str, Any], *keys: str, default: Any = "") -> Any:
    for key in keys:
        value = payload.get(key)

        if value is not None and str(value).strip() != "":
            return value

    return default


def get_profile_identity_values(person: Dict[str, Any]) -> List[str]:
    values = [
        person.get("id"),
        person.get("slug"),
        person.get("profile_id"),
        person.get("profileId"),
        person.get("bioguideId"),
    ]

    source_identity = person.get("sourceIdentity")

    if isinstance(source_identity, dict):
        values.extend(
            [
                source_identity.get("id"),
                source_identity.get("slug"),
                source_identity.get("profile_id"),
                source_identity.get("profileId"),
                source_identity.get("bioguideId"),
            ]
        )

    return [str(value).strip() for value in values if value is not None and str(value).strip()]


def find_person_for_profile_id(profile_id: str) -> Optional[Dict[str, Any]]:
    clean_profile_id = str(profile_id or "").strip()

    if not clean_profile_id:
        return None

    people_cache = db.list_people_cache()

    for cached_person in people_cache:
        cached_profile_id = str(cached_person.get("profile_id") or "").strip()

        if cached_profile_id == clean_profile_id:
            person = cached_person.get("source_json") or {}

            if isinstance(person, dict):
                person.setdefault("id", cached_profile_id)
                person.setdefault("profile_id", cached_profile_id)
                person.setdefault("displayName", cached_person.get("display_name"))
                return person

        source_json = cached_person.get("source_json") or {}

        if isinstance(source_json, dict):
            identity_values = get_profile_identity_values(source_json)

            if clean_profile_id in identity_values:
                source_json.setdefault("id", cached_profile_id or clean_profile_id)
                source_json.setdefault("profile_id", cached_profile_id or clean_profile_id)
                source_json.setdefault("displayName", cached_person.get("display_name"))
                return source_json

    for index, person in enumerate(db.load_people_json()):
        if not isinstance(person, dict):
            continue

        identity_values = get_profile_identity_values(person)
        normalized = db.normalize_person_for_cache(person, index)
        identity_values.append(str(normalized.get("profile_id") or "").strip())

        if clean_profile_id in identity_values:
            person.setdefault("id", normalized.get("profile_id") or clean_profile_id)
            person.setdefault("profile_id", normalized.get("profile_id") or clean_profile_id)
            person.setdefault("displayName", normalized.get("display_name"))
            return person

    return None


class MemberCommandCenterHandler(BaseHTTPRequestHandler):
    server_version = "MemberCommandCenterBackend/1.8A"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/health":
            api_key_status = get_api_key_status()

            self.send_json(
                {
                    "ok": True,
                    "app": "Member Command Center",
                    "version": "v1.8A",
                    "database": db.get_database_status(),
                    "api_keys": {
                        "total": api_key_status["total_keys"],
                        "configured": api_key_status["configured_keys"],
                        "missing": api_key_status["missing_keys"],
                    },
                    "server_side_runners": {
                        "openfec_finance": True,
                        "congress_legislation": True,
                        "youtube_media": True,
                        "official_web_contact": True,
                        "web_mentions": True,
                        "openstates_legislation": True,
                        "race_opponent_context": True,
                    },
                    "coverage_matrix": True,
                    "strategic_briefing": True,
                    "hydration_audit": True,
                }
            )
            return

        if parsed.path == "/api/config/status":
            status = get_api_key_status()
            db.update_api_key_registry(status["records"])
            self.send_json(status)
            return

        if parsed.path == "/api/database/status":
            self.send_json(db.get_database_status())
            return

        if parsed.path == "/api/people":
            people = db.load_people_json()
            self.send_json({"people": people, "count": len(people)})
            return

        if parsed.path == "/api/people/cache":
            self.send_json({"people": db.list_people_cache()})
            return

        if parsed.path == "/api/runs":
            query = parse_qs(parsed.query)
            profile_id = first_query_value(query, "profile_id")
            module_name = first_query_value(query, "module_name")
            limit_raw = first_query_value(query, "limit") or "100"

            try:
                limit = int(limit_raw)
            except ValueError:
                limit = 100

            self.send_json(
                {
                    "runs": db.list_intelligence_runs(
                        profile_id=profile_id,
                        module_name=module_name,
                        limit=limit,
                    )
                }
            )
            return

        if parsed.path == "/api/runs/latest":
            query = parse_qs(parsed.query)
            profile_id = first_query_value(query, "profile_id")
            self.send_json({"runs": db.get_latest_runs_by_profile(profile_id=profile_id)})
            return

        if parsed.path.startswith("/api/coverage/profile/"):
            self.handle_profile_coverage(parsed.path)
            return

        if parsed.path == "/api/coverage/all":
            self.handle_all_coverage()
            return

        if parsed.path.startswith("/api/briefing/profile/"):
            self.handle_profile_briefing(parsed.path)
            return

        if parsed.path.startswith("/api/hydration/audit/profile/"):
            self.handle_profile_hydration_audit(parsed.path)
            return

        if parsed.path == "/api/hydration/audit/all":
            self.handle_all_hydration_audit()
            return

        self.serve_static_file(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/admin/init-db":
            db.initialize_database()
            people_count = db.seed_people_cache_from_json()
            api_key_status = get_api_key_status()
            db.update_api_key_registry(api_key_status["records"])

            self.send_json(
                {
                    "ok": True,
                    "message": "Database initialized.",
                    "people_seeded": people_count,
                    "database": db.get_database_status(),
                    "api_keys": {
                        "total": api_key_status["total_keys"],
                        "configured": api_key_status["configured_keys"],
                        "missing": api_key_status["missing_keys"],
                    },
                }
            )
            return

        if parsed.path.startswith("/api/run/openfec/"):
            self.handle_openfec_run(parsed.path)
            return

        if parsed.path.startswith("/api/run/congress/"):
            self.handle_congress_run(parsed.path)
            return

        if parsed.path.startswith("/api/run/youtube/"):
            self.handle_youtube_run(parsed.path)
            return

        if parsed.path.startswith("/api/run/official-web/"):
            self.handle_official_web_run(parsed.path)
            return

        if parsed.path.startswith("/api/run/web-mentions/"):
            self.handle_web_mentions_run(parsed.path)
            return

        if parsed.path.startswith("/api/run/openstates/"):
            self.handle_openstates_run(parsed.path)
            return

        if parsed.path.startswith("/api/run/race-context/"):
            self.handle_race_context_run(parsed.path)
            return

        if parsed.path == "/api/runs":
            try:
                payload = self.read_json_body()
                saved = db.save_intelligence_run(payload)
                self.send_json({"ok": True, "run": saved}, status=HTTPStatus.CREATED)
            except ValueError as error:
                self.send_json({"ok": False, "error": str(error)}, status=HTTPStatus.BAD_REQUEST)
            except json.JSONDecodeError as error:
                self.send_json({"ok": False, "error": f"Invalid JSON: {error}"}, status=HTTPStatus.BAD_REQUEST)
            except Exception as error:
                self.send_json({"ok": False, "error": str(error)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

            return

        self.send_json({"ok": False, "error": "Not found."}, status=HTTPStatus.NOT_FOUND)

    def handle_profile_coverage(self, request_path: str) -> None:
        raw_profile_id = request_path.replace("/api/coverage/profile/", "", 1).strip("/")
        profile_id = unquote(raw_profile_id).strip()

        if not profile_id:
            self.send_json({"ok": False, "error": "profile_id is required."}, status=HTTPStatus.BAD_REQUEST)
            return

        person = find_person_for_profile_id(profile_id)

        if not person:
            self.send_json({"ok": False, "error": f"No cached profile was found for '{profile_id}'."}, status=HTTPStatus.NOT_FOUND)
            return

        latest_runs = db.get_latest_runs_by_profile(profile_id=profile_id)
        coverage = source_coverage_client.build_profile_coverage(profile_id, person, latest_runs)

        self.send_json({"ok": True, "coverage": coverage})

    def handle_all_coverage(self) -> None:
        coverage = source_coverage_client.build_all_profiles_coverage(
            db.list_people_cache(),
            lambda profile_id: db.get_latest_runs_by_profile(profile_id=profile_id),
        )
        self.send_json({"ok": True, "coverage": coverage})

    def handle_profile_briefing(self, request_path: str) -> None:
        raw_profile_id = request_path.replace("/api/briefing/profile/", "", 1).strip("/")
        profile_id = unquote(raw_profile_id).strip()

        if not profile_id:
            self.send_json({"ok": False, "error": "profile_id is required."}, status=HTTPStatus.BAD_REQUEST)
            return

        person = find_person_for_profile_id(profile_id)

        if not person:
            self.send_json({"ok": False, "error": f"No cached profile was found for '{profile_id}'."}, status=HTTPStatus.NOT_FOUND)
            return

        latest_runs = db.get_latest_runs_by_profile(profile_id=profile_id)
        coverage = source_coverage_client.build_profile_coverage(profile_id, person, latest_runs)
        briefing = strategic_briefing_client.build_strategic_briefing(
            profile_id=profile_id,
            person=person,
            latest_runs=latest_runs,
            coverage=coverage,
        )

        self.send_json({"ok": True, "briefing": briefing})

    def handle_profile_hydration_audit(self, request_path: str) -> None:
        raw_profile_id = request_path.replace("/api/hydration/audit/profile/", "", 1).strip("/")
        profile_id = unquote(raw_profile_id).strip()

        if not profile_id:
            self.send_json({"ok": False, "error": "profile_id is required."}, status=HTTPStatus.BAD_REQUEST)
            return

        person = find_person_for_profile_id(profile_id)

        if not person:
            self.send_json(
                {"ok": False, "error": f"No cached profile was found for '{profile_id}'."},
                status=HTTPStatus.NOT_FOUND,
            )
            return

        latest_runs = db.get_latest_runs_by_profile(profile_id=profile_id)
        coverage = source_coverage_client.build_profile_coverage(profile_id, person, latest_runs)
        audit = hydration_audit_client.build_profile_hydration_audit(
            profile_id=profile_id,
            person=person,
            latest_runs=latest_runs,
            coverage=coverage,
        )

        self.send_json({"ok": True, "audit": audit})

    def handle_all_hydration_audit(self) -> None:
        audit = hydration_audit_client.build_all_profiles_hydration_audit(
            db.list_people_cache(),
            lambda profile_id: db.get_latest_runs_by_profile(profile_id=profile_id),
            lambda profile_id, person, latest_runs: source_coverage_client.build_profile_coverage(
                profile_id,
                person,
                latest_runs,
            ),
        )

        self.send_json({"ok": True, "audit": audit})

    def handle_openfec_run(self, request_path: str) -> None:
        raw_profile_id = request_path.replace("/api/run/openfec/", "", 1).strip("/")
        profile_id = unquote(raw_profile_id).strip()

        if not profile_id:
            self.send_json({"ok": False, "error": "profile_id is required."}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            payload = self.read_json_body()
        except json.JSONDecodeError as error:
            self.send_json({"ok": False, "error": f"Invalid JSON: {error}"}, status=HTTPStatus.BAD_REQUEST)
            return

        cycle = str(first_payload_value(payload, "cycle", "electionCycle", default="2026")).strip() or "2026"
        api_key = os.environ.get("FEC_API_KEY", "").strip()

        if not api_key:
            self.send_json({"ok": False, "error": "FEC_API_KEY is not configured in server/.env.", "profile_id": profile_id, "module_name": "openfec_finance"}, status=HTTPStatus.BAD_REQUEST)
            return

        person = find_person_for_profile_id(profile_id)

        if not person:
            self.send_json({"ok": False, "error": f"No cached profile was found for '{profile_id}'.", "profile_id": profile_id, "module_name": "openfec_finance"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            run_payload = openfec_client.build_openfec_finance_run_payload(profile_id=profile_id, person=person, api_key=api_key, cycle=cycle)
            saved = db.save_intelligence_run(run_payload)
            self.send_json({"ok": True, "message": "OpenFEC finance run completed and saved.", "run": saved, "display": {"profile_id": saved["profile_id"], "module_name": saved["module_name"], "run_status": saved["run_status"], "summary": saved["summary"], "diagnostics": saved["diagnostics"]}}, status=HTTPStatus.CREATED)
        except openfec_client.OpenFecProfileError as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "openfec_finance"}, status=HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "openfec_finance"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_congress_run(self, request_path: str) -> None:
        raw_profile_id = request_path.replace("/api/run/congress/", "", 1).strip("/")
        profile_id = unquote(raw_profile_id).strip()

        if not profile_id:
            self.send_json({"ok": False, "error": "profile_id is required."}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            payload = self.read_json_body()
        except json.JSONDecodeError as error:
            self.send_json({"ok": False, "error": f"Invalid JSON: {error}"}, status=HTTPStatus.BAD_REQUEST)
            return

        congress = str(first_payload_value(payload, "congress", default="119")).strip() or "119"
        limit_raw = str(first_payload_value(payload, "limit", default="10")).strip() or "10"
        api_key = os.environ.get("CONGRESS_API_KEY", "").strip()

        try:
            limit = max(1, min(int(limit_raw), 50))
        except ValueError:
            limit = 10

        if not api_key:
            self.send_json({"ok": False, "error": "CONGRESS_API_KEY is not configured in server/.env.", "profile_id": profile_id, "module_name": "congress_legislation"}, status=HTTPStatus.BAD_REQUEST)
            return

        person = find_person_for_profile_id(profile_id)

        if not person:
            self.send_json({"ok": False, "error": f"No cached profile was found for '{profile_id}'.", "profile_id": profile_id, "module_name": "congress_legislation"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            run_payload = congress_client.build_congress_legislation_run_payload(profile_id=profile_id, person=person, api_key=api_key, congress=congress, limit=limit)
            saved = db.save_intelligence_run(run_payload)
            self.send_json({"ok": True, "message": "Congress.gov legislation run completed and saved.", "run": saved, "display": {"profile_id": saved["profile_id"], "module_name": saved["module_name"], "run_status": saved["run_status"], "summary": saved["summary"], "diagnostics": saved["diagnostics"]}}, status=HTTPStatus.CREATED)
        except congress_client.CongressProfileError as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "congress_legislation"}, status=HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "congress_legislation"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_youtube_run(self, request_path: str) -> None:
        raw_profile_id = request_path.replace("/api/run/youtube/", "", 1).strip("/")
        profile_id = unquote(raw_profile_id).strip()

        if not profile_id:
            self.send_json({"ok": False, "error": "profile_id is required."}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            payload = self.read_json_body()
        except json.JSONDecodeError as error:
            self.send_json({"ok": False, "error": f"Invalid JSON: {error}"}, status=HTTPStatus.BAD_REQUEST)
            return

        max_results_raw = str(first_payload_value(payload, "max_results", "maxResults", default="5")).strip() or "5"
        api_key = os.environ.get("YOUTUBE_API_KEY", "").strip()

        try:
            max_results = max(1, min(int(max_results_raw), 25))
        except ValueError:
            max_results = 5

        if not api_key:
            self.send_json({"ok": False, "error": "YOUTUBE_API_KEY is not configured in server/.env.", "profile_id": profile_id, "module_name": "youtube_media"}, status=HTTPStatus.BAD_REQUEST)
            return

        person = find_person_for_profile_id(profile_id)

        if not person:
            self.send_json({"ok": False, "error": f"No cached profile was found for '{profile_id}'.", "profile_id": profile_id, "module_name": "youtube_media"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            run_payload = youtube_client.build_youtube_media_run_payload(profile_id=profile_id, person=person, api_key=api_key, max_results=max_results)
            saved = db.save_intelligence_run(run_payload)
            self.send_json({"ok": True, "message": "YouTube media run completed and saved.", "run": saved, "display": {"profile_id": saved["profile_id"], "module_name": saved["module_name"], "run_status": saved["run_status"], "summary": saved["summary"], "diagnostics": saved["diagnostics"]}}, status=HTTPStatus.CREATED)
        except youtube_client.YouTubeProfileError as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "youtube_media"}, status=HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "youtube_media"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_official_web_run(self, request_path: str) -> None:
        raw_profile_id = request_path.replace("/api/run/official-web/", "", 1).strip("/")
        profile_id = unquote(raw_profile_id).strip()

        if not profile_id:
            self.send_json({"ok": False, "error": "profile_id is required."}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            payload = self.read_json_body()
        except json.JSONDecodeError as error:
            self.send_json({"ok": False, "error": f"Invalid JSON: {error}"}, status=HTTPStatus.BAD_REQUEST)
            return

        timeout_raw = str(first_payload_value(payload, "timeout_seconds", "timeoutSeconds", default="10")).strip() or "10"

        try:
            timeout_seconds = max(3, min(int(timeout_raw), 30))
        except ValueError:
            timeout_seconds = 10

        person = find_person_for_profile_id(profile_id)

        if not person:
            self.send_json({"ok": False, "error": f"No cached profile was found for '{profile_id}'.", "profile_id": profile_id, "module_name": "official_web_contact"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            run_payload = official_web_client.build_official_web_contact_run_payload(profile_id=profile_id, person=person, timeout_seconds=timeout_seconds)
            saved = db.save_intelligence_run(run_payload)
            self.send_json({"ok": True, "message": "Official web and contact verification run completed and saved.", "run": saved, "display": {"profile_id": saved["profile_id"], "module_name": saved["module_name"], "run_status": saved["run_status"], "summary": saved["summary"], "diagnostics": saved["diagnostics"]}}, status=HTTPStatus.CREATED)
        except official_web_client.OfficialWebProfileError as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "official_web_contact"}, status=HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "official_web_contact"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_web_mentions_run(self, request_path: str) -> None:
        raw_profile_id = request_path.replace("/api/run/web-mentions/", "", 1).strip("/")
        profile_id = unquote(raw_profile_id).strip()

        if not profile_id:
            self.send_json({"ok": False, "error": "profile_id is required."}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            payload = self.read_json_body()
        except json.JSONDecodeError as error:
            self.send_json({"ok": False, "error": f"Invalid JSON: {error}"}, status=HTTPStatus.BAD_REQUEST)
            return

        max_results_raw = str(first_payload_value(payload, "max_results", "maxResults", default="20")).strip() or "20"
        max_feeds_raw = str(first_payload_value(payload, "max_feeds", "maxFeeds", default="3")).strip() or "3"

        try:
            max_results = max(1, min(int(max_results_raw), 50))
        except ValueError:
            max_results = 20

        try:
            max_feeds = max(1, min(int(max_feeds_raw), 5))
        except ValueError:
            max_feeds = 3

        person = find_person_for_profile_id(profile_id)

        if not person:
            self.send_json({"ok": False, "error": f"No cached profile was found for '{profile_id}'.", "profile_id": profile_id, "module_name": "web_mentions"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            run_payload = web_mentions_client.build_web_mentions_run_payload(profile_id=profile_id, person=person, max_results=max_results, max_feeds=max_feeds)
            saved = db.save_intelligence_run(run_payload)
            self.send_json({"ok": True, "message": "Web mentions run completed and saved.", "run": saved, "display": {"profile_id": saved["profile_id"], "module_name": saved["module_name"], "run_status": saved["run_status"], "summary": saved["summary"], "diagnostics": saved["diagnostics"]}}, status=HTTPStatus.CREATED)
        except web_mentions_client.WebMentionsProfileError as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "web_mentions"}, status=HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "web_mentions"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_openstates_run(self, request_path: str) -> None:
        raw_profile_id = request_path.replace("/api/run/openstates/", "", 1).strip("/")
        profile_id = unquote(raw_profile_id).strip()

        if not profile_id:
            self.send_json({"ok": False, "error": "profile_id is required."}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            payload = self.read_json_body()
        except json.JSONDecodeError as error:
            self.send_json({"ok": False, "error": f"Invalid JSON: {error}"}, status=HTTPStatus.BAD_REQUEST)
            return

        api_key = os.environ.get("OPENSTATES_API_KEY", "").strip()

        if not api_key:
            self.send_json({"ok": False, "error": "OPENSTATES_API_KEY is not configured in server/.env.", "profile_id": profile_id, "module_name": "openstates_legislation"}, status=HTTPStatus.BAD_REQUEST)
            return

        bill_limit_raw = str(first_payload_value(payload, "bill_limit", "billLimit", default="10")).strip() or "10"
        vote_limit_raw = str(first_payload_value(payload, "vote_limit", "voteLimit", default="10")).strip() or "10"
        committee_limit_raw = str(first_payload_value(payload, "committee_limit", "committeeLimit", default="10")).strip() or "10"

        try:
            bill_limit = max(1, min(int(bill_limit_raw), 50))
        except ValueError:
            bill_limit = 10

        try:
            vote_limit = max(1, min(int(vote_limit_raw), 50))
        except ValueError:
            vote_limit = 10

        try:
            committee_limit = max(1, min(int(committee_limit_raw), 50))
        except ValueError:
            committee_limit = 10

        person = find_person_for_profile_id(profile_id)

        if not person:
            self.send_json({"ok": False, "error": f"No cached profile was found for '{profile_id}'.", "profile_id": profile_id, "module_name": "openstates_legislation"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            run_payload = openstates_client.build_openstates_legislation_run_payload(profile_id=profile_id, person=person, api_key=api_key, bill_limit=bill_limit, vote_limit=vote_limit, committee_limit=committee_limit)
            saved = db.save_intelligence_run(run_payload)
            self.send_json({"ok": True, "message": "OpenStates legislation run completed and saved.", "run": saved, "display": {"profile_id": saved["profile_id"], "module_name": saved["module_name"], "run_status": saved["run_status"], "summary": saved["summary"], "diagnostics": saved["diagnostics"]}}, status=HTTPStatus.CREATED)
        except openstates_client.OpenStatesProfileError as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "openstates_legislation"}, status=HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "openstates_legislation"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_race_context_run(self, request_path: str) -> None:
        raw_profile_id = request_path.replace("/api/run/race-context/", "", 1).strip("/")
        profile_id = unquote(raw_profile_id).strip()

        if not profile_id:
            self.send_json({"ok": False, "error": "profile_id is required."}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            payload = self.read_json_body()
        except json.JSONDecodeError as error:
            self.send_json({"ok": False, "error": f"Invalid JSON: {error}"}, status=HTTPStatus.BAD_REQUEST)
            return

        api_key = os.environ.get("FEC_API_KEY", "").strip()

        if not api_key:
            self.send_json({"ok": False, "error": "FEC_API_KEY is not configured in server/.env.", "profile_id": profile_id, "module_name": "race_opponent_context"}, status=HTTPStatus.BAD_REQUEST)
            return

        cycle = str(first_payload_value(payload, "cycle", "electionCycle", default="2026")).strip() or "2026"
        candidate_limit_raw = str(first_payload_value(payload, "candidate_limit", "candidateLimit", default="50")).strip() or "50"

        try:
            candidate_limit = max(1, min(int(candidate_limit_raw), 100))
        except ValueError:
            candidate_limit = 50

        person = find_person_for_profile_id(profile_id)

        if not person:
            self.send_json({"ok": False, "error": f"No cached profile was found for '{profile_id}'.", "profile_id": profile_id, "module_name": "race_opponent_context"}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            run_payload = race_context_client.build_race_opponent_context_run_payload(profile_id=profile_id, person=person, api_key=api_key, cycle=cycle, candidate_limit=candidate_limit)
            saved = db.save_intelligence_run(run_payload)
            self.send_json({"ok": True, "message": "Race and opponent context run completed and saved.", "run": saved, "display": {"profile_id": saved["profile_id"], "module_name": saved["module_name"], "run_status": saved["run_status"], "summary": saved["summary"], "diagnostics": saved["diagnostics"]}}, status=HTTPStatus.CREATED)
        except race_context_client.RaceContextProfileError as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "race_opponent_context"}, status=HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_json({"ok": False, "error": str(error), "profile_id": profile_id, "module_name": "race_opponent_context"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_cors_headers()
        self.end_headers()

    def read_json_body(self) -> Dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", "0") or "0")

        if content_length <= 0:
            return {}

        raw_body = self.rfile.read(content_length).decode("utf-8")
        return json.loads(raw_body)

    def send_json(self, payload: Dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")

        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def serve_static_file(self, request_path: str) -> None:
        clean_path = request_path.lstrip("/") or "index.html"

        if clean_path.endswith("/"):
            clean_path += "index.html"

        file_path = (PROJECT_ROOT / clean_path).resolve()

        if not str(file_path).startswith(str(PROJECT_ROOT.resolve())):
            self.send_error(HTTPStatus.FORBIDDEN)
            return

        if not file_path.exists() or not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        content = file_path.read_bytes()

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format_string: str, *args: Any) -> None:
        print(f"[MemberCommandCenter] {self.address_string()} - {format_string % args}", flush=True)


def main() -> None:
    load_dotenv()
    db.initialize_database()

    api_key_status = get_api_key_status()
    db.update_api_key_registry(api_key_status["records"])

    if os.environ.get("MCC_SEED_PEOPLE_ON_START", "1").strip().lower() not in {"0", "false", "no"}:
        db.seed_people_cache_from_json()

    host = os.environ.get("MCC_HOST", DEFAULT_HOST)
    port = int(os.environ.get("MCC_PORT", str(DEFAULT_PORT)))

    server = ThreadingHTTPServer((host, port), MemberCommandCenterHandler)

    print("", flush=True)
    print("Member Command Center backend running", flush=True)
    print(f"URL: http://{host}:{port}", flush=True)
    print(f"Database: {db.DB_PATH}", flush=True)
    print(f"API keys configured: {api_key_status['configured_keys']} / {api_key_status['total_keys']}", flush=True)
    print("", flush=True)
    print("Endpoints:", flush=True)
    print(f"  http://{host}:{port}/api/health", flush=True)
    print(f"  http://{host}:{port}/api/config/status", flush=True)
    print(f"  http://{host}:{port}/api/database/status", flush=True)
    print(f"  http://{host}:{port}/api/runs/latest", flush=True)
    print(f"  http://{host}:{port}/api/coverage/profile/<profile_id>", flush=True)
    print(f"  http://{host}:{port}/api/coverage/all", flush=True)
    print(f"  http://{host}:{port}/api/briefing/profile/<profile_id>", flush=True)
    print(f"  http://{host}:{port}/api/hydration/audit/profile/<profile_id>", flush=True)
    print(f"  http://{host}:{port}/api/hydration/audit/all", flush=True)
    print(f"  POST http://{host}:{port}/api/run/openfec/<profile_id>", flush=True)
    print(f"  POST http://{host}:{port}/api/run/congress/<profile_id>", flush=True)
    print(f"  POST http://{host}:{port}/api/run/youtube/<profile_id>", flush=True)
    print(f"  POST http://{host}:{port}/api/run/official-web/<profile_id>", flush=True)
    print(f"  POST http://{host}:{port}/api/run/web-mentions/<profile_id>", flush=True)
    print(f"  POST http://{host}:{port}/api/run/openstates/<profile_id>", flush=True)
    print(f"  POST http://{host}:{port}/api/run/race-context/<profile_id>", flush=True)
    print("", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    print("", flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping backend...", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()