OX NOVELS V6 PROMOTION PARTNERS - REBUILT LOCAL PACKAGE
=====================================================

PURPOSE
- Source questionnaire before new Dodo Live monthly and lifetime checkouts
- Owner-only Add Friend management at /admin-promotions.html
- Separate read-only partner login/view at /partner.html
- First paid monthly subscription credited to friend; later renewals credited to Mine
- Lifetime story purchase credited to referring friend
- Other/unknown attribution remains unassigned
- Does NOT transfer funds or modify PayPal/Dodo checkout fulfillment or membership access

IMPORTANT
- Do not reuse the broken earlier OX-V6-PROMOTIONS-LOCAL folder.
- This builder produces a NEW folder OX-V6-PROMOTIONS-REBUILT-LOCAL.
- The V5.2 production source and secret env files remain untouched.
- It does NOT deploy, write to D1, or apply SQL migration.
- No production deployment until source, migration and runtime behavior are verified.
- Migration MUST be applied before any V6 production deployment (otherwise backup exports and gate fail).
- Keep all .dev.vars and .dev.vars.live-backup files unchanged.

HOW TO RUN
1. Extract this ZIP to e.g. C:\Users\dundi\Downloads\OX-V6-BUILDER.
2. Open PowerShell:
   node.exe 'C:\Users\dundi\Downloads\OX-V6-BUILDER\BUILD-OX-V6-REBUILT.cjs'
   (Adjust the folder path where you extracted it.)
3. Confirm every PASS message, including "NO PRODUCTION DEPLOYMENT / NO D1 CHANGES".
4. In PowerShell:
   Set-Location 'C:\Users\dundi\OX-Novels-B9.2-TEST\OX-V6-PROMOTIONS-REBUILT-LOCAL'
   $env:CLOUDFLARE_ACCOUNT_ID = '2ae96c52ec9f266d95d50f81e5e416c1'
   npx.cmd wrangler deploy --dry-run
5. Share only the build and dry-run output (not customer DB or secrets).

AFTER VERIFICATION
- Run a local-only test of the new D1 migration and Admin UI.
- Then, with explicit approval, apply ADDITIVE migration and deploy once.
- Create Rocky account from /admin-promotions.html in owner's Admin session.
- Give partner credentials privately; friends can only view their own data.

CAVEATS
- Self-reported YouTube source cannot establish provenance with certainty.
- Existing customers/purchases are not retroactively attributed.
- Dashboard uses Dodo Live linked payment events for new subscription credits and completed lifetime records.
- Unlinked payment events are flagged rather than guessed.
- Gross allocations are NOT settlement or net payout calculations.
- Refunds are flagged for manual review; payouts are manual.
- Partner page does not allow editing, downloading, finance changes, or site Admin access.
