# OX Novels V3 — zero-dollar purchase accounting hotfix (2026-11-01)

This is an **incremental full Worker + current V3 asset bundle** based on the same release already installed on the main `ox-novels` Worker. It only changes the LIVE Dodo webhook recording for a genuine $0 completed purchase (100% discount). It does not change prices, PayPal, Dodo subscriptions, test payment handlers, signed webhook verification, or protected Player canary.

### Why
The November 1 live handler fulfilled 100%-discounted lifetime story purchases but wrote $65 to `story_lifetime_purchases.amount` and admin/audit records, even if $0 was actually charged. This bundle makes the $0 case record $0.00 in the lifetime purchase, log, notification and payment event.

### What to do
1. Extract to a new folder inside `C:\Users\dundi\OX-Novels-B9.2-TEST` (do not merge into the previous deployed folder).
2. In PowerShell: `Set-Location 'C:\Users\dundi\OX-Novels-B9.2-TEST\OX-DODO-LIVE-V3-ZERO-DOLLAR-ACCOUNTING-FIX-2026-11-01'`
3. Run `node.exe --check .\src\index.js` and `node.exe .\VERIFY-ZERO-DOLLAR-FIX.cjs`.
4. Check main Cloudflare account id `2ae96c52ec9f266d95d50f81e5e416c1` and that `wrangler.jsonc` has `routes` with `oxnovels.top` and `custom_domain: true`.
5. Run `npx.cmd wrangler deploy --dry-run`; inspect `env.DB` and `env.ASSETS`.
6. Only after verifying no unexpected configuration warning, run `npx.cmd wrangler deploy --keep-vars`. It MUST report `oxnovels.top (custom domain)`.
7. If it reports no targets deployed or tries to remove domain, stop; do not make real payments.

No secret files or D1 migration changes are included. No live sale or payment is triggered by deployment.

### Subsequent test — ONLY AFTER DEPLOYMENT VERIFICATION
Create a single-use 100% discount restricted to the ONE-TIME Dodo live lifetime product. Start a **new** checkout through the logged-in OX Novels story purchase button and apply that coupon. Only complete it if the final payable TOTAL shows exactly **$0.00**; otherwise stop before confirming payment. The official signed `payment.succeeded` event should grant only that story and record $0.00 in lifetime purchase and event ledger. Verify the resulting active entitlement before testing any subscription.

DO NOT use the shared Dodo "Share" product link for ownership/entitlement testing. DO NOT make a real positive charge merely to test this code.
