PRAGMA foreign_keys = ON;

-- One-time PayPal Support configuration lives beside recurring PayPal settings.
ALTER TABLE payment_provider_settings ADD COLUMN support_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payment_provider_settings ADD COLUMN support_email TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS support_checkout_sessions (
  token TEXT PRIMARY KEY,
  provider_order_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  environment TEXT NOT NULL DEFAULT 'sandbox',
  status TEXT NOT NULL DEFAULT 'CREATED',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_checkout_user ON support_checkout_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  target_route TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  related_key TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications(read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON admin_notifications(created_at DESC);
