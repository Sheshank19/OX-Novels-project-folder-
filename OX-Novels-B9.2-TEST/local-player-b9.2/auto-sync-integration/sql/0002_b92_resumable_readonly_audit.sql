-- Apply only to the dedicated B92_POINTER_DB, after 0001_b92_live_catalogs.sql.
-- Private Drive metadata is retained in D1 for auditing; never query it publicly.
-- These tables have NO trigger capable of publishing, activating or deleting catalog data.
CREATE TABLE IF NOT EXISTS b92_audit_cycles (
  cycle_id TEXT PRIMARY KEY, started_ms INTEGER NOT NULL, roster_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING'
);
CREATE TABLE IF NOT EXISTS b92_audit_jobs (
  cycle_id TEXT NOT NULL, story_id TEXT NOT NULL, root_id TEXT NOT NULL,
  source_version TEXT NOT NULL, ordinal INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY', attempts INTEGER NOT NULL DEFAULT 0,
  due_ms INTEGER NOT NULL DEFAULT 0, lease TEXT NOT NULL DEFAULT '',
  lease_until_ms INTEGER NOT NULL DEFAULT 0, page_count INTEGER NOT NULL DEFAULT 0,
  track_count INTEGER NOT NULL DEFAULT 0, folder_count INTEGER NOT NULL DEFAULT 0,
  result_code TEXT NOT NULL DEFAULT '', state_json TEXT NOT NULL DEFAULT '{}', updated_ms INTEGER NOT NULL,
  PRIMARY KEY(cycle_id,story_id)
);
CREATE INDEX IF NOT EXISTS b92_audit_due ON b92_audit_jobs(status,due_ms,lease_until_ms,cycle_id,ordinal);
CREATE TABLE IF NOT EXISTS b92_audit_pages (
  cycle_id TEXT NOT NULL, story_id TEXT NOT NULL, folder_id TEXT NOT NULL,
  page_no INTEGER NOT NULL, body_json TEXT NOT NULL, page_hash TEXT NOT NULL,
  PRIMARY KEY(cycle_id,story_id,folder_id,page_no)
);
