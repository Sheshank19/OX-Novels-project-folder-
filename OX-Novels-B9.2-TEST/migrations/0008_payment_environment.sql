PRAGMA foreign_keys = ON;

-- Preserve which PayPal environment produced each payment record from now on.
-- Older records remain blank and Finance labels them Legacy instead of guessing.
ALTER TABLE payment_checkout_sessions ADD COLUMN environment TEXT NOT NULL DEFAULT '';
ALTER TABLE member_subscriptions ADD COLUMN environment TEXT NOT NULL DEFAULT '';
ALTER TABLE payment_events ADD COLUMN environment TEXT NOT NULL DEFAULT '';
