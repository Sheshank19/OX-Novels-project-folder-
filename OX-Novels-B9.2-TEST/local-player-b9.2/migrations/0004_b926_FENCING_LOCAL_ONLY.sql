-- B9.2.6 LOCAL SQLITE TEST ONLY. DO NOT RUN IN ANY REMOTE D1 DATABASE.
-- Dependencies: local 0002 (compact checkpoints), local 0003 (lease scheduler).
-- The assertion row is inserted and deleted in the SAME atomic D1-style batch as
-- the page/final-phase mutation. A rollback removes all mutations if the lease
-- is stale, stolen, or expired according to the caller's supplied current time.
CREATE TABLE IF NOT EXISTS b926_fence_assertions (
 scan_id TEXT PRIMARY KEY NOT NULL,
 lease_token TEXT NOT NULL,
 lease_epoch INTEGER NOT NULL,
 checked_at_ms INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS b926_reject_stale_fence
BEFORE INSERT ON b926_fence_assertions
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM b925_schedule
  WHERE scan_id=NEW.scan_id
   AND status='RUNNING'
   AND lease_token=NEW.lease_token
   AND lease_epoch=NEW.lease_epoch
   AND lease_until_ms>NEW.checked_at_ms
   AND NEW.checked_at_ms>=updated_at_ms
 ) THEN RAISE(ABORT, 'B926_STALE_LEASE') END;
END;
