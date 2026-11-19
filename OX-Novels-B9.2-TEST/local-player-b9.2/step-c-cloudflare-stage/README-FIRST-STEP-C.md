# OX B9.2 — Step C: dedicated Cloudflare staging (SYNTHETIC ONLY)

**Current package state: PREPARED, NOT DEPLOYED.** This is a separate tiny staging **control plane**, not an audio Player, not a catalog publisher, and not the nightly Drive scanner. It has no Drive endpoint, cron, Queue producer, R2 access, account handoff, audio files, or production bindings. Real story catalogs and secrets must never be packaged with it.

## What has passed already

- Real Drive Step A: one unchanged 534-track story; only 18 resolver GET/POST requests; baseline unchanged; no catalog built.
- Offline Step B: SHA-256 keyed immutable catalogs, pointer promotion, grace logic, rollback; 534-track private candidate kept local.
- Step C source: dedicated stage-only Worker with KV blobs, D1 CAS, basic generation grace, rollback, and integrity verification for **one fake 1-track synthetic catalog**. No private 534-track candidate is accepted.

## 1. Do this locally first (safe, no Cloudflare access)

Extract these files under `C:\Users\dundi\OX-Novels-B9.2-TEST`, preserving the folder structure. Run:

`local-player-b9.2\step-c-cloudflare-stage\B9.2-STEP-C-LOCAL-TEST.bat`

Expected: Node test report with all tests passed; no network calls. No need to rerun the Drive audit, catalog preparation, Player playback tests, or Step B rehearsal.

## 2. Review before any Cloudflare deployment (separate approval gate)

Do not run the following preparation/deployment instructions until you intentionally decide to create resources in **Cloudflare Account B**. The files in this ZIP do not deploy anything.

Isolation checklist:

1. In the Cloudflare dashboard, explicitly choose **Player Account B** and verify which account you are in. Confirm no resource below already exists, and that this new separate Worker will not be a route for `oxnovels.top` or the existing Player.
2. Prepare dedicated **new** resources named `ox-b92-step-c-synthetic-db` (D1) and `ox-b92-step-c-synthetic-kv` (KV). NEVER bind an existing production namespace/database. The account's Free-plan quotas are shared with other resources in Account B.
3. Copy `wrangler.example.toml` to **this folder's** `wrangler.toml` (not the existing Player folder). Replace *only* its two resource ID placeholders with the fresh staging IDs. If any ID matches the existing Player's KV/D1, STOP.
4. This Worker name must remain `ox-b92-step-c-synthetic-stage`; do not change it to any existing name. There are no production URLs, routes, schedules, secrets or Drive IDs in the source.
5. Generate a **new, unique, random 32+ character** staging admin secret; do not reuse the Google staging resolver secret or Player token. Do not paste it into chat, documentation, scripts or `wrangler.toml`. Install it interactively using the Wrangler secret command *after the separate Worker exists*, or the dashboard Worker Secret UI.
6. Apply `migrations/0001_stage_pointers.sql` to the **new staging D1 only**. Do not point any migration command at production.

Cloudflare CLI illustration **for a later approved staging run** (run in `local-player-b9.2/step-c-cloudflare-stage`):

```powershell
# Confirm Account B and check existing resources; stop if wrong account.
npx wrangler whoami
npx wrangler d1 list
npx wrangler kv namespace list

# Create new dedicated resources using the Cloudflare dashboard, capture their IDs.
# Copy wrangler.example.toml -> wrangler.toml, replace two placeholders.
# Check the separate Worker name and both brand-new resource IDs again.

# Apply schema to new D1 only. Wrangler CLI must have the correct Account B selected.
npx wrangler d1 migrations apply ox-b92-step-c-synthetic-db --remote --config wrangler.toml

# Only after confirmation: deploy the separate test Worker.
npx wrangler deploy --config wrangler.toml

# Set a new secret interactively; DO NOT place its value in this file.
npx wrangler secret put STAGE_ADMIN_TOKEN --config wrangler.toml
```

**Deployment is not authorized by the present package.** The CLI commands are reference instructions for an explicit future go-ahead, not commands for automated execution. Do not put the stage Worker on a custom domain or add production Worker routes. `STAGE_MODE=synthetic-only` is mandatory. With the secret unset, privileged routes fail closed.

## 3. Endpoints after approval and deployment

`GET /health` is public and reports only the safety posture. Every other route requires `Authorization: Bearer <new stage-only secret>`, disallows browser-origin requests, and never returns a catalog:

- `GET /v1/status`: revision and synthetic generation labels (no private blobs).
- `POST /v1/bootstrap` body `{}`: place the fixed synthetic initial catalog in new KV and initialize D1 revision 0.
- `POST /v1/prepare` body `{}`: write a second fixed synthetic catalog to new KV.
- `POST /v1/promote` body `{"expectedRevision":0}`: conditional D1 revision 0 -> 1, accept prior generation for 30 minutes.
- `GET /v1/integrity`: read both blobs and verify SHA-256/content metadata.
- `POST /v1/rollback` body `{"expectedRevision":1}`: conditional D1 revision 1 -> 2.

There is no reset/delete, user-data ingest, Drive credential input, publish endpoint or playback route. All inputs are deliberately bounded to a synthetic 1-track fixture. The remote smoke script is **one-time only** against a fresh D1; do not rerun once the DB has a pointer. To run a separate repeat test, use a new isolated database after review, never production.

## 4. Optional remote smoke after a separately approved deployment

Set `B92_STEP_C_URL` to the new stage Worker root URL, and `B92_STEP_C_TOKEN` to the new stage-only secret in your private terminal environment (do NOT paste either into chat). From this staging folder run `node scripts/remote-stage-smoke.mjs`. This script does approximately **8 requests**, creates two tiny synthetic KV blobs, performs one pointer promotion and rollback, and reports only sanitized results.

The script refuses a Worker URL that does not have this exact staging Worker name on a `workers.dev` host. This protects against accidentally calling the production Player URL; it is not an authentication substitute.

## 5. Crucial limitations

- **D1 CAS**: Uses an atomic `UPDATE ... WHERE revision=?` and checks the changed-row count, with a `first-primary` session for subsequent reads. Race contention, replication, and failover are NOT proven locally.
- **KV propagation**: Cloudflare KV is eventually consistent across locations; same-region read-back does NOT prove global visibility. Propagation of newly written blobs must be accounted for before production cutover.
- **10 ms Worker Free CPU**: not measured by offline tests. Inspect the new Worker metrics and D1/KV operation counts after remote staging. Avoid any wider load testing until this is confirmed.
- **Candidate authorization**: A successfully prepared private 534-track candidate is NOT automatically publishable. Consistent Drive observations are not an atomic snapshot proof; multi-page Drive content can change during listing.
- **Audio stream grace**: The current production Player does not use this staging pointer and cannot yet honor staged previous-generation grace; live listening continuity must be addressed separately before any production integration.
- **Free plan**: no billable service is introduced by preparing local files. Creating test Worker/KV/D1 consumes shared Account B quotas. D1 free-tier daily limits are enforced; stop if limits are approached.
- **Production safety**: no edits to `oxnovels.top`, Player B, Google Apps Script, `\.dev.vars`, `.dev.vars.live-backup`, existing catalogs, or local Player secrets. Keep the local 534-track candidate private.

## Documentation sources

- Cloudflare Wrangler bindings: https://developers.cloudflare.com/workers/wrangler/configuration/
- D1 Sessions API: https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 prepared statements: https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- KV global eventual consistency: https://developers.cloudflare.com/kv/api/write-key-value-pairs/
- Workers Free limits: https://developers.cloudflare.com/workers/platform/limits/
