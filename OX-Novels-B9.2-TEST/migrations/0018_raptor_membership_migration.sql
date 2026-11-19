PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS raptor_migration_claims (
  provider_subscription_id TEXT PRIMARY KEY,
  raptor_user_id TEXT NOT NULL,
  ox_user_id TEXT,
  raptor_plan TEXT NOT NULL DEFAULT '',
  raptor_pricing_tier TEXT NOT NULL DEFAULT '',
  raptor_price TEXT NOT NULL DEFAULT '',
  paypal_plan_id TEXT NOT NULL DEFAULT '',
  paypal_status TEXT NOT NULL DEFAULT '',
  next_billing_at TEXT,
  claimed_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  FOREIGN KEY (ox_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_raptor_migration_user ON raptor_migration_claims(ox_user_id, paypal_status);
CREATE INDEX IF NOT EXISTS idx_raptor_migration_raptor_user ON raptor_migration_claims(raptor_user_id);
