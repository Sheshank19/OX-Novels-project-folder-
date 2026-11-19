PRAGMA foreign_keys = ON;

-- Permanent "has successfully paid at least once" fact.
-- Membership status may later expire/cancel, but paid_once_at is never cleared.
ALTER TABLE users ADD COLUMN paid_once_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_paid_once
  ON users (paid_once_at, account_status);

-- Backfill real/legacy membership payments, real/legacy Lifetime Story payments,
-- and already-verified RAPTOR migrations.
-- Sandbox / Dodo test-mode payments intentionally do not unlock permanent Chat.
WITH paid_candidates AS (
  SELECT
    ms.user_id AS user_id,
    COALESCE(NULLIF(ms.last_payment_at,''), NULLIF(ms.started_at,''), ms.created_at) AS paid_at
  FROM member_subscriptions ms
  WHERE ms.user_id IS NOT NULL
    AND LOWER(COALESCE(ms.environment,'')) NOT IN ('sandbox','test','test_mode')
    AND (
      NULLIF(ms.last_payment_at,'') IS NOT NULL
      OR UPPER(COALESCE(ms.status,'')) IN ('ACTIVE','CANCELLED','EXPIRED','SUSPENDED')
    )

  UNION ALL

  SELECT
    lp.user_id AS user_id,
    lp.purchased_at AS paid_at
  FROM story_lifetime_purchases lp
  WHERE lp.user_id IS NOT NULL
    AND LOWER(COALESCE(lp.environment,'')) NOT IN ('sandbox','test','test_mode')
    AND NULLIF(lp.purchased_at,'') IS NOT NULL

  UNION ALL

  SELECT
    rm.ox_user_id AS user_id,
    rm.claimed_at AS paid_at
  FROM raptor_migration_claims rm
  WHERE rm.ox_user_id IS NOT NULL
    AND NULLIF(rm.claimed_at,'') IS NOT NULL
)
UPDATE users
SET paid_once_at = (
  SELECT MIN(pc.paid_at)
  FROM paid_candidates pc
  WHERE pc.user_id = users.id
)
WHERE paid_once_at IS NULL
  AND EXISTS (
    SELECT 1 FROM paid_candidates pc WHERE pc.user_id = users.id
  );
