PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS telegram_connections (
  user_id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL UNIQUE,
  telegram_username TEXT,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  status TEXT NOT NULL DEFAULT 'linked',
  linked_at TEXT NOT NULL,
  joined_at TEXT,
  left_at TEXT,
  last_join_request_at TEXT,
  last_checked_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_connections_telegram_user
  ON telegram_connections (telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_connections_status
  ON telegram_connections (status);

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user
  ON telegram_link_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expiry
  ON telegram_link_tokens (expires_at);
