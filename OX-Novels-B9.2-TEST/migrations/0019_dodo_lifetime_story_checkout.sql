PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dodo_lifetime_checkout_sessions (
  token TEXT PRIMARY KEY,
  checkout_session_id TEXT UNIQUE,
  checkout_url TEXT NOT NULL DEFAULT '',
  payment_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  permanent_story_id TEXT NOT NULL,
  story_id_snapshot TEXT NOT NULL DEFAULT '',
  title_snapshot TEXT NOT NULL DEFAULT '',
  drive_url_snapshot TEXT NOT NULL DEFAULT '',
  drive_folder_id_snapshot TEXT NOT NULL DEFAULT '',
  cover_snapshot TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL,
  amount TEXT NOT NULL DEFAULT '49.00',
  currency TEXT NOT NULL DEFAULT 'USD',
  environment TEXT NOT NULL DEFAULT 'test_mode',
  status TEXT NOT NULL DEFAULT 'INIT',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (permanent_story_id) REFERENCES lifetime_story_products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dodo_lifetime_checkout_user_story
  ON dodo_lifetime_checkout_sessions(user_id, permanent_story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dodo_lifetime_checkout_status_expires
  ON dodo_lifetime_checkout_sessions(status, expires_at);
