-- Requires confirmed backup before use; additive to existing main website ox-novels-db only.
CREATE TABLE IF NOT EXISTS dodo_live_membership_control (
 user_id TEXT PRIMARY KEY,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dodo_live_webhook_receipts (
 event_id TEXT PRIMARY KEY,
 status TEXT NOT NULL CHECK(status IN ('PROCESSING','PROCESSED','FAILED')),
 updated_ms INTEGER NOT NULL
);
