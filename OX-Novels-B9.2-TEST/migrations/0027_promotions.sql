PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS promotion_partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promotion_partners_status_name
  ON promotion_partners(status, name);

CREATE TABLE IF NOT EXISTS promotion_customer_attributions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  partner_id TEXT,
  source_label TEXT NOT NULL DEFAULT '',
  partner_name_snapshot TEXT NOT NULL DEFAULT '',
  selected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(partner_id) REFERENCES promotion_partners(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_promotion_customer_partner
  ON promotion_customer_attributions(partner_id, selected_at);

-- Immutable referral snapshots for successful purchases. These rows are kept
-- when a partner or Promotions customer is removed; global payment records are
-- never deleted or rewritten by Promotions actions.
CREATE TABLE IF NOT EXISTS promotion_payment_attributions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event_ref TEXT NOT NULL UNIQUE,
  partner_id TEXT,
  source_label TEXT NOT NULL DEFAULT '',
  partner_name_snapshot TEXT NOT NULL DEFAULT '',
  amount TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  provider TEXT NOT NULL DEFAULT '',
  purchased_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promotion_payment_partner_date
  ON promotion_payment_attributions(partner_id, purchased_at);
CREATE INDEX IF NOT EXISTS idx_promotion_payment_user_date
  ON promotion_payment_attributions(user_id, purchased_at);
