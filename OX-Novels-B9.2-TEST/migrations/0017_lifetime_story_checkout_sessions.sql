PRAGMA foreign_keys = ON;

-- Ephemeral PayPal Orders checkout state for the /49 lifetime-story flow.
-- Completed ownership is stored separately in story_lifetime_purchases.
CREATE TABLE IF NOT EXISTS lifetime_story_checkout_sessions (
  token TEXT PRIMARY KEY,
  paypal_order_id TEXT UNIQUE,
  paypal_approve_url TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL,
  permanent_story_id TEXT NOT NULL,
  story_id_snapshot TEXT NOT NULL DEFAULT '',
  title_snapshot TEXT NOT NULL DEFAULT '',
  drive_url_snapshot TEXT NOT NULL DEFAULT '',
  drive_folder_id_snapshot TEXT NOT NULL DEFAULT '',
  cover_snapshot TEXT NOT NULL DEFAULT '',
  amount TEXT NOT NULL DEFAULT '49.00',
  currency TEXT NOT NULL DEFAULT 'USD',
  environment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'INIT',
  paypal_capture_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (permanent_story_id) REFERENCES lifetime_story_products(id) ON DELETE CASCADE,
  UNIQUE (paypal_capture_id)
);

CREATE INDEX IF NOT EXISTS idx_lifetime_checkout_user_story
  ON lifetime_story_checkout_sessions(user_id, permanent_story_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifetime_checkout_expires
  ON lifetime_story_checkout_sessions(status, expires_at);
