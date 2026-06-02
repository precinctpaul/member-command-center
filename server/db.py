import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "member_command_center.sqlite"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_connection() -> sqlite3.Connection:
    ensure_data_dir()
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON;")
    return connection


def initialize_database() -> None:
    ensure_data_dir()

    with get_connection() as connection:
        schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
        connection.executescript(schema_sql)
        connection.execute(
            """
            INSERT OR IGNORE INTO schema_migrations (migration_name)
            VALUES (?)
            """,
            ("v1_5_backend_sqlite_foundation",),
        )
        connection.commit()


def json_dumps(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=False, separators=(",", ":"))


def json_loads(value: Optional[str], fallback: Any) -> Any:
    if not value:
        return fallback

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def load_people_json() -> List[Dict[str, Any]]:
    people_path = DATA_DIR / "people.json"

    if not people_path.exists():
        return []

    with people_path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        if isinstance(data.get("people"), list):
            return data["people"]
        if isinstance(data.get("profiles"), list):
            return data["profiles"]

    return []


def normalize_person_for_cache(person: Dict[str, Any], index: int) -> Dict[str, Any]:
    display_name = first_value(
        person.get("displayName"),
        person.get("name"),
        person.get("fullName"),
        person.get("preferredName"),
        f"Profile {index + 1}",
    )

    profile_id = first_value(
        person.get("id"),
        person.get("slug"),
        person.get("bioguideId"),
        nested_get(person, "sourceIdentity", "bioguideId"),
        slugify(display_name),
        f"profile-{index + 1}",
    )

    completion_score = person.get("completionScore")
    if completion_score is None:
        completion_score = estimate_completion_score(person)

    return {
        "profile_id": str(profile_id),
        "display_name": str(display_name),
        "office_type": str(first_value(person.get("officeType"), person.get("officeTypeNormalized"), "")),
        "party": str(first_value(person.get("party"), "")),
        "state": str(first_value(person.get("state"), person.get("stateCode"), "")),
        "district": str(first_value(person.get("district"), person.get("districtLabel"), "")),
        "completion_score": int(completion_score or 0),
        "source_json": person,
    }


def seed_people_cache_from_json() -> int:
    people = load_people_json()
    now = utc_now_iso()

    with get_connection() as connection:
        for index, person in enumerate(people):
            cached = normalize_person_for_cache(person, index)
            connection.execute(
                """
                INSERT INTO people_cache (
                  profile_id,
                  display_name,
                  office_type,
                  party,
                  state,
                  district,
                  completion_score,
                  source_json,
                  updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(profile_id) DO UPDATE SET
                  display_name = excluded.display_name,
                  office_type = excluded.office_type,
                  party = excluded.party,
                  state = excluded.state,
                  district = excluded.district,
                  completion_score = excluded.completion_score,
                  source_json = excluded.source_json,
                  updated_at = excluded.updated_at
                """,
                (
                    cached["profile_id"],
                    cached["display_name"],
                    cached["office_type"],
                    cached["party"],
                    cached["state"],
                    cached["district"],
                    cached["completion_score"],
                    json_dumps(cached["source_json"]),
                    now,
                ),
            )

        connection.commit()

    return len(people)


def list_people_cache() -> List[Dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
              profile_id,
              display_name,
              office_type,
              party,
              state,
              district,
              completion_score,
              source_json,
              updated_at
            FROM people_cache
            ORDER BY display_name COLLATE NOCASE ASC
            """
        ).fetchall()

    return [row_to_people_cache(row) for row in rows]


def row_to_people_cache(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "profile_id": row["profile_id"],
        "display_name": row["display_name"],
        "office_type": row["office_type"],
        "party": row["party"],
        "state": row["state"],
        "district": row["district"],
        "completion_score": row["completion_score"],
        "source_json": json_loads(row["source_json"], {}),
        "updated_at": row["updated_at"],
    }


def save_intelligence_run(payload: Dict[str, Any]) -> Dict[str, Any]:
    now = utc_now_iso()

    profile_id = str(payload.get("profile_id") or payload.get("profileId") or "").strip()
    module_name = str(payload.get("module_name") or payload.get("moduleName") or "").strip()
    run_status = str(payload.get("run_status") or payload.get("runStatus") or "completed").strip()

    if not profile_id:
        raise ValueError("profile_id is required.")

    if not module_name:
        raise ValueError("module_name is required.")

    run_id = str(payload.get("run_id") or payload.get("runId") or f"run_{uuid.uuid4().hex}")

    started_at = payload.get("started_at") or payload.get("startedAt") or now
    completed_at = payload.get("completed_at") or payload.get("completedAt") or now
    source_name = payload.get("source_name") or payload.get("sourceName") or ""
    source_url = payload.get("source_url") or payload.get("sourceUrl") or ""

    summary = payload.get("summary_json") or payload.get("summary") or {}
    diagnostics = payload.get("diagnostics_json") or payload.get("diagnostics") or {}
    raw = payload.get("raw_json") or payload.get("raw") or {}

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO intelligence_runs (
              run_id,
              profile_id,
              module_name,
              run_status,
              started_at,
              completed_at,
              source_name,
              source_url,
              summary_json,
              diagnostics_json,
              raw_json,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
              profile_id = excluded.profile_id,
              module_name = excluded.module_name,
              run_status = excluded.run_status,
              started_at = excluded.started_at,
              completed_at = excluded.completed_at,
              source_name = excluded.source_name,
              source_url = excluded.source_url,
              summary_json = excluded.summary_json,
              diagnostics_json = excluded.diagnostics_json,
              raw_json = excluded.raw_json,
              updated_at = excluded.updated_at
            """,
            (
                run_id,
                profile_id,
                module_name,
                run_status,
                started_at,
                completed_at,
                source_name,
                source_url,
                json_dumps(summary),
                json_dumps(diagnostics),
                json_dumps(raw),
                now,
                now,
            ),
        )
        connection.commit()

    saved = get_run_by_run_id(run_id)
    if not saved:
        raise RuntimeError("Run was not saved.")

    return saved


def get_run_by_run_id(run_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM intelligence_runs
            WHERE run_id = ?
            """,
            (run_id,),
        ).fetchone()

    if not row:
        return None

    return row_to_intelligence_run(row)


def list_intelligence_runs(
    profile_id: Optional[str] = None,
    module_name: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    clauses = []
    params: List[Any] = []

    if profile_id:
        clauses.append("profile_id = ?")
        params.append(profile_id)

    if module_name:
        clauses.append("module_name = ?")
        params.append(module_name)

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    safe_limit = max(1, min(int(limit or 100), 500))

    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT *
            FROM intelligence_runs
            {where_sql}
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT ?
            """,
            (*params, safe_limit),
        ).fetchall()

    return [row_to_intelligence_run(row) for row in rows]


def get_latest_runs_by_profile(profile_id: Optional[str] = None) -> List[Dict[str, Any]]:
    params: List[Any] = []
    where_sql = ""

    if profile_id:
        where_sql = "WHERE profile_id = ?"
        params.append(profile_id)

    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT runs.*
            FROM intelligence_runs runs
            INNER JOIN (
              SELECT profile_id, module_name, MAX(datetime(created_at)) AS latest_created_at
              FROM intelligence_runs
              {where_sql}
              GROUP BY profile_id, module_name
            ) latest
              ON runs.profile_id = latest.profile_id
             AND runs.module_name = latest.module_name
             AND datetime(runs.created_at) = latest.latest_created_at
            ORDER BY runs.profile_id COLLATE NOCASE ASC, runs.module_name COLLATE NOCASE ASC
            """,
            tuple(params),
        ).fetchall()

    return [row_to_intelligence_run(row) for row in rows]


def row_to_intelligence_run(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "run_id": row["run_id"],
        "profile_id": row["profile_id"],
        "module_name": row["module_name"],
        "run_status": row["run_status"],
        "started_at": row["started_at"],
        "completed_at": row["completed_at"],
        "source_name": row["source_name"],
        "source_url": row["source_url"],
        "summary": json_loads(row["summary_json"], {}),
        "diagnostics": json_loads(row["diagnostics_json"], {}),
        "raw": json_loads(row["raw_json"], {}),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def update_api_key_registry(key_records: Iterable[Dict[str, Any]]) -> None:
    now = utc_now_iso()

    with get_connection() as connection:
        for record in key_records:
            connection.execute(
                """
                INSERT INTO api_key_registry (
                  key_name,
                  service_name,
                  category,
                  required_for,
                  is_configured,
                  updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(key_name) DO UPDATE SET
                  service_name = excluded.service_name,
                  category = excluded.category,
                  required_for = excluded.required_for,
                  is_configured = excluded.is_configured,
                  updated_at = excluded.updated_at
                """,
                (
                    record["key_name"],
                    record["service_name"],
                    record["category"],
                    record["required_for"],
                    1 if record.get("is_configured") else 0,
                    now,
                ),
            )

        connection.commit()


def get_database_status() -> Dict[str, Any]:
    initialize_database()

    with get_connection() as connection:
        table_rows = connection.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            ORDER BY name
            """
        ).fetchall()

        people_count = connection.execute("SELECT COUNT(*) AS count FROM people_cache").fetchone()["count"]
        runs_count = connection.execute("SELECT COUNT(*) AS count FROM intelligence_runs").fetchone()["count"]
        api_keys_count = connection.execute("SELECT COUNT(*) AS count FROM api_key_registry").fetchone()["count"]

    return {
        "database_path": str(DB_PATH),
        "tables": [row["name"] for row in table_rows],
        "people_cache_count": people_count,
        "intelligence_runs_count": runs_count,
        "api_key_registry_count": api_keys_count,
    }


def first_value(*values: Any) -> Any:
    for value in values:
        if value is None:
            continue

        if isinstance(value, str) and value.strip() == "":
            continue

        return value

    return ""


def nested_get(value: Dict[str, Any], *keys: str) -> Any:
    current: Any = value

    for key in keys:
        if not isinstance(current, dict):
            return ""
        current = current.get(key)

    return current if current is not None else ""


def slugify(value: Any) -> str:
    text = str(value or "").strip().lower()
    output = []

    for character in text:
        if character.isalnum():
            output.append(character)
        elif character in {" ", "-", "_", ".", "/"}:
            output.append("-")

    slug = "".join(output)

    while "--" in slug:
        slug = slug.replace("--", "-")

    return slug.strip("-") or "profile"


def estimate_completion_score(person: Dict[str, Any]) -> int:
    checks = [
        person.get("displayName") or person.get("name") or person.get("fullName"),
        person.get("title") or person.get("officeTitle") or person.get("currentOffice"),
        person.get("party"),
        person.get("state"),
        person.get("district"),
        person.get("officeType"),
        person.get("bio"),
        person.get("headshot") or person.get("photoUrl"),
        person.get("officialLinks"),
        person.get("sourceIdentity"),
    ]

    completed = sum(1 for item in checks if item)
    return round((completed / len(checks)) * 100)