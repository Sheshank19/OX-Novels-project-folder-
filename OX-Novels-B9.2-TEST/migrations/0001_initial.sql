PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT 'Unknown',
  status TEXT NOT NULL DEFAULT 'Unknown',
  cover TEXT NOT NULL DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 9999,
  source_url TEXT NOT NULL DEFAULT '',
  drive_url TEXT NOT NULL DEFAULT '',
  checked TEXT NOT NULL DEFAULT 'Never',
  automatic_check INTEGER NOT NULL DEFAULT 1,
  manual_lock INTEGER NOT NULL DEFAULT 0,
  confidence INTEGER NOT NULL DEFAULT 0,
  status_last_checked TEXT,
  genre_last_checked TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stories_public ON stories (visible, sort_order, title);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories (status);

CREATE TABLE IF NOT EXISTS membership_tiers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price TEXT NOT NULL DEFAULT '$0.00',
  cycle TEXT NOT NULL DEFAULT '/ month',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft',
  benefits_json TEXT NOT NULL DEFAULT '[]',
  cover TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 9999,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_membership_tiers_public ON membership_tiers (status, sort_order, name);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO site_settings (key, value) VALUES
('appearance', '{"name":"","handle":"","description":"","accent":"#13c3b3","layout":"Integrated banner"}'),
('settings', '{"language":"English","timezone":"UTC","currency":"USD — US Dollar","supportEmail":"","supportLabel":"Support","showSearch":true,"showChat":true,"showSupport":true,"preventSelection":true}');

-- Fresh installs intentionally contain no demo stories and no membership tiers.
-- Add all site content from Admin or restore a site backup.
