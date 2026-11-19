PRAGMA foreign_keys = ON;

-- Permanent product identity for a story. This row survives story-library
-- deletion/reimport; current_story_id is only the present active assignment.
CREATE TABLE IF NOT EXISTS lifetime_story_products (
  id TEXT PRIMARY KEY,
  current_story_id TEXT UNIQUE,
  state TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (current_story_id) REFERENCES stories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lifetime_story_products_state
  ON lifetime_story_products(state, updated_at DESC);

-- Immutable snapshots/aliases observed for each permanent story identity.
CREATE TABLE IF NOT EXISTS story_identity_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  permanent_story_id TEXT NOT NULL,
  story_id_snapshot TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  title_key TEXT NOT NULL DEFAULT '',
  drive_url TEXT NOT NULL DEFAULT '',
  drive_folder_id TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (permanent_story_id) REFERENCES lifetime_story_products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_story_identity_history_story
  ON story_identity_history(story_id_snapshot, id DESC);
CREATE INDEX IF NOT EXISTS idx_story_identity_history_drive_folder
  ON story_identity_history(drive_folder_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_story_identity_history_title_key
  ON story_identity_history(title_key, id DESC);
CREATE INDEX IF NOT EXISTS idx_story_identity_history_product
  ON story_identity_history(permanent_story_id, id DESC);

-- Durable purchase ledger. Snapshot fields are never replaced when a story is
-- renamed, moved, re-covered, deleted, or reimported.
CREATE TABLE IF NOT EXISTS story_lifetime_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name_snapshot TEXT NOT NULL DEFAULT '',
  user_email_snapshot TEXT NOT NULL DEFAULT '',
  permanent_story_id TEXT NOT NULL,
  original_story_id TEXT NOT NULL DEFAULT '',
  original_title TEXT NOT NULL DEFAULT '',
  original_drive_url TEXT NOT NULL DEFAULT '',
  original_drive_folder_id TEXT NOT NULL DEFAULT '',
  original_cover TEXT NOT NULL DEFAULT '',
  amount TEXT NOT NULL DEFAULT '49.00',
  currency TEXT NOT NULL DEFAULT 'USD',
  provider TEXT NOT NULL DEFAULT 'paypal',
  environment TEXT NOT NULL DEFAULT '',
  paypal_order_id TEXT,
  paypal_capture_id TEXT,
  purchase_status TEXT NOT NULL DEFAULT 'Completed',
  entitlement_status TEXT NOT NULL DEFAULT 'Active',
  purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (permanent_story_id) REFERENCES lifetime_story_products(id) ON DELETE RESTRICT,
  UNIQUE (user_id, permanent_story_id),
  UNIQUE (paypal_order_id),
  UNIQUE (paypal_capture_id)
);

CREATE INDEX IF NOT EXISTS idx_story_lifetime_purchases_user
  ON story_lifetime_purchases(user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_lifetime_purchases_product
  ON story_lifetime_purchases(permanent_story_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_lifetime_purchases_status
  ON story_lifetime_purchases(entitlement_status, purchase_status, purchased_at DESC);

-- Every automatic/manual reassignment is retained for reconciliation auditing.
CREATE TABLE IF NOT EXISTS lifetime_story_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  permanent_story_id TEXT NOT NULL,
  from_story_id TEXT NOT NULL DEFAULT '',
  to_story_id TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'system',
  reason TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (permanent_story_id) REFERENCES lifetime_story_products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lifetime_story_assignments_product
  ON lifetime_story_assignments(permanent_story_id, id DESC);

-- Give every currently active story a permanent identity immediately. Future
-- story changes are reconciled by Worker code without changing these IDs.
INSERT INTO lifetime_story_products (id, current_story_id, state, created_at, updated_at)
SELECT 'story_' || lower(hex(randomblob(12))), s.id, 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM stories s
WHERE NOT EXISTS (
  SELECT 1 FROM lifetime_story_products p WHERE p.current_story_id = s.id
);

INSERT INTO story_identity_history (
  permanent_story_id, story_id_snapshot, title, title_key, drive_url, drive_folder_id, cover, recorded_at
)
SELECT p.id, s.id, s.title, lower(trim(s.title)), COALESCE(s.drive_url,''), '', COALESCE(s.cover,''), CURRENT_TIMESTAMP
FROM lifetime_story_products p
JOIN stories s ON s.id = p.current_story_id
WHERE NOT EXISTS (
  SELECT 1 FROM story_identity_history h WHERE h.permanent_story_id = p.id
);
