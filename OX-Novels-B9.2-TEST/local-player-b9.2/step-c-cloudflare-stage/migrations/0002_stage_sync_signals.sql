-- B9.2 Step D — synthetic-stage event ledger ONLY.
-- Apply ONLY to ox-b92-step-c-synthetic-db in Cloudflare Account B.
-- No player/production tables are referenced or changed.
CREATE TABLE IF NOT EXISTS stage_sync_signals (
  signal_id TEXT NOT NULL PRIMARY KEY CHECK(length(signal_id)=32),
  signal_state TEXT NOT NULL CHECK(signal_state IN ('unchanged','change_quarantined')),
  received_at INTEGER NOT NULL
);
