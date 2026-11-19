PRAGMA foreign_keys = ON;

-- Preserve who made a real payment even if that account is later deleted.
ALTER TABLE payment_events ADD COLUMN user_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE payment_events ADD COLUMN user_email_snapshot TEXT NOT NULL DEFAULT '';

-- This table used to be created lazily by the runtime. Make it part of the
-- formal schema so Backup / Restore and clean clones are deterministic.
CREATE TABLE IF NOT EXISTS user_client_context (
  user_id TEXT PRIMARY KEY,
  timezone TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- One-time cleanup for user-specific notifications left behind by accounts
-- that were already deleted before v16.6.0. Activity Log intentionally stays.
DELETE FROM admin_notifications
WHERE user_id IS NULL
  AND (
    type IN ('user','chat','payment')
    OR related_key LIKE 'register:%'
    OR related_key LIKE 'chat:%'
    OR related_key LIKE 'admin-user-action:%'
  );

-- Remove orphan Sandbox/test payment records. Live records are intentionally
-- preserved for accounting. A manually-classified Sandbox row is also removed.
DELETE FROM payment_events
WHERE user_id IS NULL
  AND (
    LOWER(COALESCE(environment,''))='sandbox'
    OR EXISTS (
      SELECT 1 FROM finance_record_overrides f
      WHERE f.record_key=('event:' || payment_events.id)
        AND LOWER(COALESCE(f.environment,''))='sandbox'
    )
  );

-- Remove presentation overrides whose underlying payment row no longer exists.
DELETE FROM finance_record_overrides
WHERE record_key LIKE 'event:%'
  AND NOT EXISTS (
    SELECT 1 FROM payment_events p
    WHERE ('event:' || p.id)=finance_record_overrides.record_key
  );
