PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_test_overrides (
  user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  simulate_paid_once INTEGER NOT NULL DEFAULT 1,
  chat_enabled INTEGER NOT NULL DEFAULT 1,
  telegram_enabled INTEGER NOT NULL DEFAULT 1,
  membership_status TEXT NOT NULL DEFAULT 'Active',
  lifetime_enabled INTEGER NOT NULL DEFAULT 0,
  lifetime_story_id TEXT,
  purchased_section_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_test_overrides_enabled
  ON user_test_overrides (enabled);

INSERT OR IGNORE INTO user_test_overrides(
  user_id,enabled,simulate_paid_once,chat_enabled,telegram_enabled,membership_status,
  lifetime_enabled,lifetime_story_id,purchased_section_enabled,created_at,updated_at
)
SELECT
  id,0,1,1,1,'Active',0,NULL,1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users
WHERE LOWER(email)=LOWER('d.sheshank1234@gmail.com')
LIMIT 1;
