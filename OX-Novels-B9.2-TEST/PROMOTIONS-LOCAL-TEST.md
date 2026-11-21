# OX Novels — Promotions and Chat Unlock local test

This branch contains the Promotions / referral questionnaire and manual Chat-unlock changes.

## Start a local copy (Windows PowerShell)

1. Extract this branch ZIP into a separate folder. Keep your existing project folder unchanged.
2. Open PowerShell in the extracted `OX-Novels-B9.2-TEST` folder.
3. Install dependencies:

   ```powershell
   npm ci
   ```

4. Create a local-only secrets file:

   ```powershell
   Copy-Item .dev.vars.example .dev.vars
   ```

   Edit `.dev.vars` and set a strong local `ADMIN_PASSWORD`. Do not copy production secrets into this file.

5. Apply migrations to the local D1 database only:

   ```powershell
   npx.cmd wrangler d1 migrations apply ox-novels-db --local
   ```

6. Start the local Worker:

   ```powershell
   npx.cmd wrangler dev
   ```

7. Open the local URL printed by Wrangler (normally `http://localhost:8787`).

## What to test

- Admin → Users → Manage a user → Chat access repair → Unlock Chat manually.
  - The user's Chat access should become available.
  - Their payment history, membership and subscription must remain unchanged.
- Admin → Promotions:
  - Add a friend / YouTube channel.
  - Confirm it appears as an option in the purchase questionnaire.
  - Delete a friend and confirm current attribution rows are removed while historical payment snapshots remain.
  - Change a customer's owner and confirm the original selection date is unchanged.
  - Delete a Promotions customer and confirm the OX user still exists and can log in.
- Homepage Membership → Join Membership:
  - The referral questionnaire should appear before checkout.
- Homepage story card → Lifetime purchase:
  - The same referral questionnaire should appear before checkout.
- Select a source and submit; verify the customer appears in Admin → Promotions.
- Check D1 backup/restore includes the new Promotions tables and manual Chat grant column.

## Safety

- Use `--local` for migrations. Do not run `db:remote`, `--remote`, or `wrangler deploy` for this test.
- This branch is not merged into `main` and has not been deployed to Cloudflare.
- The local D1 database is separate from the production D1 database.
- Payment provider behavior is unchanged by this feature work. Do not test with real payment credentials or real customer payments.
- Google sign-in requires the project's appropriate OAuth configuration. You can still inspect the Admin UI and test Admin-side Promotions management without completing a real checkout.
