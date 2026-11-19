# OX Novels — Dodo Live + PayPal Coexistence (LOCAL STAGE, 2026-11-01)

**STATUS: REVISED LOCAL CANDIDATE (V2) ONLY — NOT DEPLOYABLE AS A COMPLETE LIVE PAYMENT SYSTEM YET.**

This package is prepared from the *November 1* main `ox-novels` Worker export (Pasted text 20261101-092556). It is not the older October candidate and includes the working `a-dragon-s-revenge` protected Player handoff. No Cloudflare/PayPal/Dodo changes were made by this package.

## Evidence and scope

- PayPal `member_subscriptions`: 7 ACTIVE, 8 APPROVAL_PENDING, 1 CANCELLED, 1 SUSPENDED (live). Never delete or bulk-change these rows.
- One Dodo `test_mode` ACTIVE record. Not a Dodo Live subscription.
- PayPal renewal, RAPTOR webhook, original $49 lifetime constants, historical purchase records and B9.2 canary remain in the candidate.
- Added separate Live Dodo checkout route `/api/payments/dodo/live-checkout` and selected-story route `/api/story-purchases/dodo-live-checkout`.
- Added separately signed Live Dodo webhook route `/api/payments/dodo/live-webhook`.
- Live payment uses `https://live.dodopayments.com` and `DODO_PAYMENTS_LIVE_API_KEY`. Existing sandbox uses its original key.
- Live lifetime purchase uses $65 base price; historical $49 is intentionally NOT altered.
- Created provider-aware membership reconciliation and durable webhook receipt staging.
- Public sandbox checkout and test-webhook routes are disabled by default in the local candidate (can be re-enabled privately through `OX_ENABLE_DODO_SANDBOX=1` if needed).

## Minimum local checks (Windows PowerShell)

Extract ZIP to `C:\Users\dundi\OX-Novels-B9.2-TEST`.

```powershell
$dir='C:\Users\dundi\OX-Novels-B9.2-TEST\OX-DODO-LIVE-STAGE-LOCAL'
node.exe --check "$dir\OX-MAIN-WORKER-LIVE-STAGE-CANDIDATE.mjs"
node.exe "$dir\TEST-PROVIDER-ISOLATION.mjs"
```

Expected: Node syntax completes successfully; `13/13` local simulated tests pass. No network calls or customer records are modified by these checks.

`REVIEW-CHANGES.patch` is a source diff against the November 1 original Worker. **Do not paste the whole candidate into Cloudflare yet.**

## Required before any production deployment

1. Compare against the latest **currently deployed** main Worker and latest frontend build. Never overwrite newer production code or its ASSETS binding. Preserve main Worker rollback deployment and D1 backup.
2. Validate the migration (`MIGRATION-REQUIRED-BEFORE-DEPLOY.sql`) against a local/staging copy of `ox-novels-db`; apply to production only after backup and validation. It adds two new tables and does not delete any data.
3. Add non-secret configuration `DODO_LIVE_PREMIUM_PRODUCT_ID` and `DODO_LIVE_LIFETIME_PRODUCT_ID` using product IDs copied from Dodo Live Mode; confirm exact ID and price in Dodo. `DODO_PAYMENTS_LIVE_API_KEY` is already a configured encrypted Cloudflare Secret.
4. Build and verify production frontend integration from the *latest* website assets: its membership and $65 per-story buttons must POST to the new endpoints, pass `tierId` or `storyId`, and not use generic Dodo Share links. Existing `/49` path may remain as a legacy URL but price labels and copy must be revised.
5. Deploy a code candidate with `OX_ENABLE_DODO_LIVE` **absent** first; exercise forbidden/unconfigured-route responses, existing PayPal login/access, protected canary, and main assets before enabling payments.
6. Create a separate Dodo **Live** webhook endpoint only after the `/api/payments/dodo/live-webhook` route is deployed and signature handling independently checked. Set its signing secret privately as `DODO_PAYMENTS_LIVE_WEBHOOK_KEY` on the main Worker (not the test webhook key); subscribe to payment and subscription lifecycle events. Optionally configure `DODO_LIVE_BUSINESS_ID`.
7. Only enable with `OX_ENABLE_DODO_LIVE=1` when the code, D1 migration, frontend, webhook secret, event handlers, and customer regression tests have all passed. A web checkout return is never proof of payment; activation comes only from signed webhooks.
8. Use a bounded authorized live payment + membership/lifetime fulfillment check, inspect Dodo dashboard and D1 records, and verify an existing PayPal subscriber remains active. Keep a rollback plan for code and the **feature flag**; do not roll back D1 purchase records after a real customer pays.

## Security notes

- Do not paste API keys, webhook secrets, credentials, `.dev.vars`, or customer records into chat. This ZIP includes none of them.
- The previously shown Dodo *Test Mode* signing secret was visible in a screenshot; rotate it privately if not already done.
- Do not deploy `OX-DODO-PAYPAL-COEXISTENCE-LOCAL.zip`: it predates the latest live Worker and has not been merged safely.
- Zero hosting changes: no new Worker account, R2, or other paid hosting components. The local staged database migration uses the existing main D1.

## Frontend review candidate included

`FRONTEND-REVIEW-ONLY/` contains a guarded reference change set generated from the latest uploaded TEST archive assets, not a verified production asset export. `app.js` has been syntax-checked. It maps *new purchases* to Dodo Live routes and updates future-purchase $49 labels to $65 while retaining old PayPal functions. **Do not deploy these review files before matching the current production static assets.** See `FRONTEND-REVIEW-ONLY/IMPORTANT-NOT-DEPLOYABLE.md`.

## V2 critical safety correction

The older V1 staged Worker accidentally gated the signed Live webhook behind `OX_ENABLE_DODO_LIVE`, the same switch used to stop new checkouts. V2 separates this: `dodoLiveWebhookReady` requires only a privately configured signing secret, while `dodoLiveEnabled` controls checkout creation. This allows payments made before an emergency checkout pause to remain fulfillable. Do not deploy V1.

The two additive D1 tables have already been created in production as confirmed by the user screenshots on Nov 1, 2026. **Do not repeat the migration.**

## Known unfinished items

- The current website frontend source must be verified and updated before checkout buttons go live.
- Full end-to-end D1/Webhook integration and real-payments testing are still required. Offline checks alone do not prove real provider behavior or guarantee protection of customer access.
- Dodo's live webhook callback URL is **not registered yet**; do not create it targeting the old sandbox handler.
- Test account access originally granted from the test mode record needs separate review, not a destructive bulk reset.
