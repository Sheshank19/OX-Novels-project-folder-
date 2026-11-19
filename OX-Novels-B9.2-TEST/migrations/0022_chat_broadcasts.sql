PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chat_broadcasts (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  audience TEXT NOT NULL,
  audience_label TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  recipient_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_broadcasts_created_at
  ON chat_broadcasts (created_at DESC);
