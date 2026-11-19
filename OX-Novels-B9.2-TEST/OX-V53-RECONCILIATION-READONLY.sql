SELECT
  'payment_event' AS source,
  COALESCE(provider, 'unknown') AS provider,
  COALESCE(event_type, 'unknown') AS status,
  COUNT(*) AS records,
  ROUND(COALESCE(SUM(CAST(NULLIF(amount, '') AS REAL)), 0), 2) AS recorded_amount
FROM payment_events
GROUP BY provider, event_type

UNION ALL

SELECT
  'subscription',
  COALESCE(provider, 'unknown'),
  COALESCE(status, 'unknown'),
  COUNT(*),
  NULL
FROM member_subscriptions
GROUP BY provider, status

UNION ALL

SELECT
  'lifetime_purchase',
  COALESCE(provider, 'unknown'),
  COALESCE(purchase_status, '') || '/' || COALESCE(entitlement_status, ''),
  COUNT(*),
  ROUND(COALESCE(SUM(CAST(amount AS REAL)), 0), 2)
FROM story_lifetime_purchases
GROUP BY provider, purchase_status, entitlement_status

UNION ALL

SELECT
  'dodo_webhook_receipt',
  'dodo',
  status,
  COUNT(*),
  NULL
FROM dodo_live_webhook_receipts
GROUP BY status

ORDER BY source, provider, status;
