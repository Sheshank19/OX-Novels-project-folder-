PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS post_read_state (
  user_id TEXT PRIMARY KEY,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_read_state_seen
  ON post_read_state (last_seen_at);

INSERT OR IGNORE INTO post_read_state (user_id,last_seen_at,updated_at)
SELECT
  u.id,
  COALESCE(
    (SELECT MAX(COALESCE(published_at,created_at)) FROM posts WHERE status='Published'),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  ),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users u;
