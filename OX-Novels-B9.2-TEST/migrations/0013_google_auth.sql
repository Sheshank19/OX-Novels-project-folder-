PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_google_auth (
  user_id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  google_email TEXT NOT NULL COLLATE NOCASE,
  picture_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_google_auth_email ON user_google_auth (google_email);

INSERT OR IGNORE INTO site_settings (key,value,updated_at) VALUES
('google_auth','{"clientId":""}',CURRENT_TIMESTAMP);
