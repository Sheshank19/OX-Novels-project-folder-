# OX B9.2 — Actual Cloudflare read-only sync canary (existing listen Worker)

**Scope:** This is the necessary cloud integration of the multi-story durable read-only scanner. It uses the existing `listen` Worker and ONE new dedicated Free-tier D1 database. **No new Worker, Queue, R2, Cloudflare plan, Drive mutations, protected catalog publication, or live automatic catalog updates.** Do not run repeated local BAT tests; the targeted compatibility and safety checks were already run during development.

## Why the dedicated binding is `B92_AUDIT_DB`

The existing Player's `B92_POINTER_DB` lookup affects normal audio/page requests. Binding it early would add needless D1 reads to all listeners. The new read-only `B92_AUDIT_DB` does **not** activate that lookup. Later, AFTER publication safety is verified, the same D1 database can additionally receive the `B92_POINTER_DB` binding. The creation of this database under the name `ox-b92-catalog-control` is not a new paid service if it stays within Cloudflare Free limits.

## Sequence (one real canary, not another synthetic stage)

**1. New, separate Apps Script resolver.** In Google Apps Script, create a NEW Apps Script project and paste `docs/OX-B92-MULTI-ROOT-RESOLVER.gs`. Do not replace the working `lab-v3` resolver. Under Project settings → Script properties, add `OX_STAGE_RESOLVER_SECRET` with a newly generated, strong random secret (32+ characters). Deploy as Web App, execute as account owner and allow access to the web app; authorization is enforced by the secret in POST bodies. Save the `/exec` URL privately. DO NOT paste either the URL or secret into chat, source archives or public files. Google Drive read-only access will be required; review authorization scopes. The script has no write methods.

**2. Create ONE dedicated D1 database in Cloudflare Player Account B.** On your Windows machine, from `OX-Novels-B9.2-TEST\\local-player-b5`, run:

```powershell
npx wrangler whoami
npx wrangler d1 create ox-b92-catalog-control
```

Read the new database UUID from the Wrangler output. Make sure it is in the SAME Cloudflare account as `listen`. If Wrangler is not authenticated to the right account, stop rather than creating a database elsewhere.

**3. Local source/config merge.** Extract this ZIP at the root of `OX-Novels-B9.2-TEST`. Run `local-player-b9.2\\audit-cloud-ready\\B9.2-PREPARE-READONLY-CLOUD-LOCAL.bat`. Enter only the newly created database UUID. Do not paste the resolver URL into this installer. This action:
- copies the reviewed audit code into `local-player-b5/src` without touching the existing B9 manager or audio handler;
- adds the isolated `B92_AUDIT_DB` binding to `local-player-b5/wrangler.jsonc`;
- adds `B92_AUDIT_CANARY_STORY=a-dragon-s-revenge`;
- sets `B92_AUDIT_MODE=off` and NO cron, so no scans can start yet;
- preserves the existing configuration and backs up changed source files.

**4. Apply SQL migrations to the NEW D1, NOT OX's database.** In `OX-Novels-B9.2-TEST\\local-player-b5`, run:

```powershell
npx wrangler d1 execute ox-b92-catalog-control --remote --file="../local-player-b9.2/audit-cloud-ready/sql/0001_b92_live_catalogs.sql"
npx wrangler d1 execute ox-b92-catalog-control --remote --file="../local-player-b9.2/audit-cloud-ready/sql/0002_b92_resumable_readonly_audit.sql"
```

This creates only the schema. It does not insert real story metadata until scanning begins. Check both commands succeed BEFORE enabling cron.

**5. Configure two Worker secrets locally, NEVER send them in chat.** Ensure existing website and Player share the correct `OX_PLAYER_SYNC_KEY`; if the Player secret is not already present, set it securely with `npx wrangler secret put OX_PLAYER_SYNC_KEY`. Set `B92_AUDIT_RESOLVER_SECRET` to the exact value of the new Apps Script project property using `npx wrangler secret put B92_AUDIT_RESOLVER_SECRET`. Set the new Apps Script `/exec` URL with `npx wrangler secret put B92_AUDIT_RESOLVER_URL`, so it is not written into `wrangler.jsonc`. Wrangler prompts privately. From `local-player-b5` only. Avoid rotating or replacing a working existing secret unnecessarily. Never put them into `wrangler.jsonc`.

**6. Enable single-story read-only canary and deploy the existing Worker ONCE.** After the secrets and migrations are ready, run `local-player-b9.2\\audit-cloud-ready\\B9.2-ENABLE-ONE-STORY-AUDIT-LOCAL.bat`. This changes local `B92_AUDIT_MODE` to `readonly`, adds a 5-minute cron, and restricts the first audit to ONE public story: `a-dragon-s-revenge` (the known 534-track test story). Next, in `local-player-b5`:

```powershell
npx wrangler deploy
```

**WARNING:** This is the first REAL deployment to the existing `listen` production Worker. Take a `wrangler.jsonc` and source backup first, ensure `main=src/index.js` and Worker name `listen` match your working project, and check the production `/health` and sample playback after deployment. The canary will only READ Drive inventory and write private audit pages to D1. It cannot publish an updated catalog.

**7. Observe one real story; no repeat scanner tests.** Wait for the first scheduled scans (the 7-folder, 534-track story may need multiple 5-minute invocations). Log in to the existing Player Admin. From that same browser origin, in Developer Tools Console:

```js
fetch('/admin/api/b9', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'audit-status'})}).then(r=>r.json()).then(console.log)
```

The response has aggregate statuses, no Drive IDs or encrypted track keys. A completed story will show `OBSERVED_UNPINNED`; this is a successful **read-only observation**, not permission to publish. Also inspect the `listen` Worker Metrics and D1 metrics for CPU, errors, rows written and execution volume. Keep the canary to one story until usage is known. Check existing listening still works after the deployment.

### Stop / rollback if needed

Do not delete the D1 or any source/roster files. In `local-player-b5/wrangler.jsonc`, change `B92_AUDIT_MODE` to `off` and remove the newly added `*/5 * * * *` cron from `triggers.crons` (if that cron is the only one, remove `triggers` entirely), then `npx wrangler deploy`. Existing static catalogs remain unchanged. Never delete existing cron schedules that were present before B9.2.

### Engineering limits / remaining work

The Apps Script Drive iterator provides signed, resumable pagination but **not** an atomic Drive snapshot. Completed observations cannot trigger activation. The next integration must provide independent consistency proof (for example, bounded change-window verification plus two complete matching observations and failure on concurrent changes), build protected catalog candidates, and connect the existing gated D1/KV promotion. Nothing in this package silently lowers the already-installed publication safeguards. For all 242 stories, the total Apps Script runtime and Cloudflare D1 row writes must be measured before scheduling full scans; a one-story canary alone doesn't prove daily quota feasibility.
