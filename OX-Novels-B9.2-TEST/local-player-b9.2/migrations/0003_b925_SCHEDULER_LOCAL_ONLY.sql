-- B9.2.5 OFFLINE-ONLY additive SQLite staging schema. NEVER run against remote D1.
-- Dependency: local 0002_b924_METADATA_TEST_ONLY.sql.
CREATE TABLE IF NOT EXISTS b925_schedule (
 scan_id TEXT PRIMARY KEY REFERENCES b924_scans(scan_id),
 status TEXT NOT NULL CHECK(status IN ('READY','RUNNING','WAITING','DONE','FAILED')),
 attempts INTEGER NOT NULL DEFAULT 0,
 steps_completed INTEGER NOT NULL DEFAULT 0,
 next_due_ms INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT NOT NULL DEFAULT '',
 lease_epoch INTEGER NOT NULL DEFAULT 0,
 lease_until_ms INTEGER NOT NULL DEFAULT 0,
 last_error TEXT NOT NULL DEFAULT '',
 created_at_ms INTEGER NOT NULL,
 updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS b925_due ON b925_schedule(status,next_due_ms,lease_until_ms);
