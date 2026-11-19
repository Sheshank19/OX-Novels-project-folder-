PRAGMA foreign_keys = ON;

-- Admin-only presentation overrides for Finance. These do not delete or mutate
-- the underlying PayPal subscription/payment records.
CREATE TABLE IF NOT EXISTS finance_record_overrides (
  record_key TEXT PRIMARY KEY,
  environment TEXT NOT NULL DEFAULT '',
  exclude_from_revenue INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
