from pathlib import Path


APP_PATH = Path("server/app.py")


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def insert_once(text, marker, insertion, label):
    if insertion.strip() in text:
        print(f"Already present: {label}")
        return text

    require(marker in text, f"Could not find marker for {label}: {marker!r}")
    return text.replace(marker, marker + insertion, 1)


def replace_once(text, old, new, label):
    if new in text:
        print(f"Already updated: {label}")
        return text

    require(old in text, f"Could not find text for {label}: {old!r}")
    return text.replace(old, new, 1)


def main():
    require(APP_PATH.exists(), f"Could not find {APP_PATH}")

    text = APP_PATH.read_text(encoding="utf-8")
    original = text

    backup_path = APP_PATH.with_suffix(".py.v17a_before_hydration_backup")
    if not backup_path.exists():
        backup_path.write_text(original, encoding="utf-8")
        print(f"Backup written: {backup_path}")

    text = insert_once(
        text,
        "import db\n",
        "import hydration_audit_client\n",
        "hydration_audit_client import",
    )

    text = text.replace('"version": "v1.7A"', '"version": "v1.8A"')
    text = text.replace('"version": "v1.7A.1"', '"version": "v1.8A"')
    text = text.replace('"version": "v1.7B"', '"version": "v1.8A"')
    text = text.replace('"version": "v1.7B.1"', '"version": "v1.8A"')
    text = text.replace('"version": "v1.7B.2"', '"version": "v1.8A"')

    if '"hydration_audit": True' not in text:
        if '"strategic_briefing": True,' in text:
            text = text.replace(
                '"strategic_briefing": True,',
                '"strategic_briefing": True,\n                    "hydration_audit": True,',
                1,
            )
        elif '"strategic_briefing": True' in text:
            text = text.replace(
                '"strategic_briefing": True',
                '"strategic_briefing": True,\n                    "hydration_audit": True',
                1,
            )
        else:
            require(False, "Could not find strategic_briefing health flag to insert hydration_audit after.")

    route_block = '''
        if parsed.path.startswith("/api/hydration/audit/profile/"):
            self.handle_profile_hydration_audit(parsed.path)
            return

        if parsed.path == "/api/hydration/audit/all":
            self.handle_all_hydration_audit()
            return

'''

    if 'parsed.path.startswith("/api/hydration/audit/profile/")' not in text:
        text = insert_once(
            text,
            "        self.serve_static_file(parsed.path)\n",
            route_block,
            "hydration audit GET routes",
        )

    methods_block = '''
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

'''

    if "def handle_profile_hydration_audit" not in text:
        text = insert_once(
            text,
            "    def handle_profile_coverage(self, request_path: str) -> None:\n",
            methods_block,
            "hydration audit handler methods",
        )

    if 'print(f"  http://{host}:{port}/api/hydration/audit/profile/<profile_id>", flush=True)' not in text:
        text = insert_once(
            text,
            '    print(f"  http://{host}:{port}/api/briefing/profile/<profile_id>", flush=True)\n',
            '    print(f"  http://{host}:{port}/api/hydration/audit/profile/<profile_id>", flush=True)\n'
            '    print(f"  http://{host}:{port}/api/hydration/audit/all", flush=True)\n',
            "startup hydration printout",
        )
    elif 'print(f"  http://{host}:{port}/api/hydration/audit/all", flush=True)' not in text:
        text = insert_once(
            text,
            '    print(f"  http://{host}:{port}/api/hydration/audit/profile/<profile_id>", flush=True)\n',
            '    print(f"  http://{host}:{port}/api/hydration/audit/all", flush=True)\n',
            "startup hydration all printout",
        )

    APP_PATH.write_text(text, encoding="utf-8")

    print("Patched server/app.py for v1.8A hydration audit.")
    print("Now restart the backend and test /api/health.")


if __name__ == "__main__":
    main()