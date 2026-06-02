import json
import mimetypes
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import parse_qs, urlparse

import db


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8081


API_KEY_DEFINITIONS: List[Dict[str, str]] = [
    {
        "key_name": "POLICYNOTE_API_KEY",
        "service_name": "PolicyNote",
        "category": "policy_legislative_data",
        "required_for": "PolicyNote people/entity lookup and policy intelligence enrichment",
    },
    {
        "key_name": "GEMINI_API_KEY",
        "service_name": "Google Gemini",
        "category": "ai",
        "required_for": "AI summarization, extraction, classification, and drafting workflows",
    },
    {
        "key_name": "CONGRESS_API_KEY",
        "service_name": "Congress.gov",
        "category": "federal_legislative",
        "required_for": "Federal bills, sponsored legislation, cosponsored legislation, member data, and legislative actions",
    },
    {
        "key_name": "OPENSTATES_API_KEY",
        "service_name": "OpenStates",
        "category": "state_legislative",
        "required_for": "State legislators, bills, votes, committees, and jurisdiction-level legislative data",
    },
    {
        "key_name": "GOVINFO_API_KEY",
        "service_name": "GovInfo",
        "category": "federal_documents",
        "required_for": "Federal documents, packages, committee prints, Congressional Record, and official publications",
    },
    {
        "key_name": "LEGISCAN_API_KEY",
        "service_name": "LegiScan",
        "category": "state_legislative",
        "required_for": "State bill tracking, legislative status, sponsors, and vote/event metadata",
    },
    {
        "key_name": "FEC_API_KEY",
        "service_name": "OpenFEC",
        "category": "campaign_finance",
        "required_for": "Federal campaign finance, committee totals, filings, debts, loans, spending, and receipts",
    },
    {
        "key_name": "GOOGLE_CIVIC_API_KEY",
        "service_name": "Google Civic Information API",
        "category": "civic_election",
        "required_for": "Election information, representatives, polling places, and civic geography lookups",
    },
    {
        "key_name": "GOOGLE_FACT_CHECK_API_KEY",
        "service_name": "Google Fact Check Tools API",
        "category": "fact_checking",
        "required_for": "Fact-check claim search and public claim verification tracking",
    },
    {
        "key_name": "GOOGLE_CUSTOM_SEARCH_API_KEY",
        "service_name": "Google Custom Search API",
        "category": "web_search",
        "required_for": "Public mentions, web clippings, article discovery, image search, and open web monitoring",
    },
    {
        "key_name": "GOOGLE_KNOWLEDGE_GRAPH_API_KEY",
        "service_name": "Google Knowledge Graph API",
        "category": "identity",
        "required_for": "Entity disambiguation, knowledge graph IDs, and public identity enrichment",
    },
    {
        "key_name": "GOOGLE_CUSTOM_SEARCH_ENGINE_ID",
        "service_name": "Google Custom Search Engine",
        "category": "web_search",
        "required_for": "Configured custom search engine ID used with Google Custom Search",
    },
    {
        "key_name": "YOUTUBE_API_KEY",
        "service_name": "YouTube Data API",
        "category": "media_video",
        "required_for": "YouTube channel stats, latest videos, channel discovery, and video proof monitoring",
    },
    {
        "key_name": "VIMEO_CHANNEL_URL",
        "service_name": "Vimeo",
        "category": "media_video",
        "required_for": "Vimeo channel/source URL for sync and video inventory workflows",
    },
    {
        "key_name": "VIMEO_ACCESS_TOKEN",
        "service_name": "Vimeo API",
        "category": "media_video",
        "required_for": "Authenticated Vimeo API access",
    },
    {
        "key_name": "VIMEO_USER_ID",
        "service_name": "Vimeo API",
        "category": "media_video",
        "required_for": "Vimeo user-level sync and account identification",
    },
    {
        "key_name": "VIMEO_SYNC_ON_START",
        "service_name": "Vimeo Sync",
        "category": "media_video",
        "required_for": "Local setting to determine whether Vimeo sync should run when backend starts",
    },
    {
        "key_name": "MODECK_API_KEY",
        "service_name": "MoDeck",
        "category": "creative_automation",
        "required_for": "MoDeck render/package automation",
    },
    {
        "key_name": "MODECK_API_BASE_URL",
        "service_name": "MoDeck",
        "category": "creative_automation",
        "required_for": "MoDeck API base URL",
    },
    {
        "key_name": "MODECK_DEFAULT_DECK",
        "service_name": "MoDeck",
        "category": "creative_automation",
        "required_for": "Default MoDeck deck/template target",
    },
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


class MemberCommandCenterHandler(BaseHTTPRequestHandler):
    server_version = "MemberCommandCenterBackend/1.5"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/health":
            api_key_status = get_api_key_status()
            self.send_json(
                {
                    "ok": True,
                    "app": "Member Command Center",
                    "version": "v1.5",
                    "database": db.get_database_status(),
                    "api_keys": {
                        "total": api_key_status["total_keys"],
                        "configured": api_key_status["configured_keys"],
                        "missing": api_key_status["missing_keys"],
                    },
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