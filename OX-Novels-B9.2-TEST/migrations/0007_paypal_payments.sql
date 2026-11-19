PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS payment_provider_settings (
  provider TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'sandbox',
  client_id TEXT NOT NULL DEFAULT '',
  webhook_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO payment_provider_settings(provider,enabled,mode,client_id,webhook_id)
VALUES('paypal',0,'sandbox','','');

CREATE TABLE IF NOT EXISTS membership_payment_plans (
  tier_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_plan_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tier_id, provider),
  FOREIGN KEY (tier_id) REFERENCES membership_tiers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_checkout_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tier_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_plan_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tier_id) REFERENCES membership_tiers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_checkout_user ON payment_checkout_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS member_subscriptions (
  provider_subscription_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tier_id TEXT,
  external_plan_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'APPROVAL_PENDING',
  next_billing_at TEXT,
  last_payment_at TEXT,
  started_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tier_id) REFERENCES membership_tiers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_member_subscriptions_user ON member_subscriptions(user_id, status);

CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  user_id TEXT,
  provider_subscription_id TEXT,
  amount TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Processed',
  occurred_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_events_created ON payment_events(created_at DESC);
