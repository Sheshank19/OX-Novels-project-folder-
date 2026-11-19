CREATE TABLE IF NOT EXISTS ox_promo_partners (
  id TEXT PRIMARY KEY,
  channel_name TEXT NOT NULL,
  login_name TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ox_promo_attributions (
  user_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL
    CHECK(source_type IN ('owner','partner','other')),
  partner_id TEXT,
  other_source TEXT NOT NULL DEFAULT '',
  selected_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(partner_id) REFERENCES ox_promo_partners(id)
);

CREATE INDEX IF NOT EXISTS idx_ox_promo_partner
ON ox_promo_attributions(partner_id);

CREATE TABLE IF NOT EXISTS ox_promo_partner_sessions (
  token_hash TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(partner_id) REFERENCES ox_promo_partners(id)
    ON DELETE CASCADE
);
