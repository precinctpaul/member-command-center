PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS people_cache (
  profile_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  office_type TEXT,
  party TEXT,
  state TEXT,
  district TEXT,
  completion_score INTEGER,
  source_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS intelligence_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  profile_id TEXT NOT NULL,
  module_name TEXT NOT NULL,
  run_status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  source_name TEXT,
  source_url TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  diagnostics_json TEXT NOT NULL DEFAULT '{}',
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_intelligence_runs_profile_module
ON intelligence_runs(profile_id, module_name);

CREATE INDEX IF NOT EXISTS idx_intelligence_runs_created_at
ON intelligence_runs(created_at);

CREATE INDEX IF NOT EXISTS idx_intelligence_runs_status
ON intelligence_runs(run_status);

CREATE TABLE IF NOT EXISTS api_key_registry (
  key_name TEXT PRIMARY KEY,
  service_name TEXT NOT NULL,
  category TEXT NOT NULL,
  required_for TEXT NOT NULL,
  is_configured INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);