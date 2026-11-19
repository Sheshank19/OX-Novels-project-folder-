# OX B9.2 — STEP D / Real Drive scan → safe staging signal journal

**Current ZIP status: CODE ONLY / NOTHING DEPLOYED.** This bridges the real, paginated Step A Drive scanner to an isolated **one-bit event journal** in the existing **Step C synthetic-only Worker**. It is NOT automatic publication, does NOT upload the 534-track catalog, and does NOT update a catalog pointer.

## Architecture and scope

1. The Step D client preflights the **exact** existing synthetic staging Worker (`/health`, authenticated `/v1/sync-status`). If the Stage Worker has not been upgraded, STOP **before scanning Drive**.
2. Step A runs its existing real, read-only Drive scan: if unchanged vs the saved audit baseline, one complete scan; if changed, two matching scans and a private prepared catalog on your PC. Any failure halts without sending a signal. **Step A never updates the saved baseline.**
3. Step D reduces the result to exactly `unchanged` or `change_quarantined` and a new random 128-bit event nonce. It sends NO filenames, IDs, Drive URLs, encryption keys, story titles, track counts, catalog JSON, raw fingerprints or hashes.
4. The stage-only Worker authenticates the request; validates the *exact two-key JSON schema*; stores the nonce and the outcome in a new dedicated D1 `stage_sync_signals` table; and explicitly leaves KV/catalog pointers untouched. Duplicate requests with the same nonce are idempotent; reusing a nonce with a different status is rejected.
5. Step D reads the event count back. This proves one staging journal handoff, not a production catalog update. Matching Drive passes do not prove an atomic snapshot.

**Cost:** local tests = 0 Cloudflare/Drive requests. Later one live unchanged Drive handoff ≈ one Step A scan (historically 18 resolver calls), plus **4 tiny staging Worker requests**, 1 tiny D1 inserted row. No paid product or new staging storage resource.

## What's already installed from prior steps

- User's working test project at `C:\Users\dundi\OX-Novels-B9.2-TEST` with Step A's `local-player-b9.2/staging/sync-one-story-local.mjs` and baseline settings.
- Existing live **isolated** Account B Worker `ox-b92-step-c-synthetic-stage` using its *own* `STAGE_KV`, `STAGE_DB` and `STAGE_MODE="synthetic-only"`; D1 migration `0001_stage_pointers.sql` previously applied. The 8-request Step C smoke test already ran; **do not rerun it**.
- The *separate* stage-only admin token `STAGE_ADMIN_TOKEN` lives in that Worker. It might no longer be available as a local variable; **do not reveal it**.

## Step 1 — Local tests only (do this first)

1. Back up the separate TEST folder.
2. Extract this ZIP into the TEST folder, **preserving subfolders**. Do not touch `.dev.vars`, `.dev.vars.live-backup`, Drive staging credentials, protected private candidates, original static catalogs or the Player.
3. Double-click `local-player-b9.2\step-d-bridge\B9.2-STEP-D-LOCAL-TEST.bat`.
4. Expect 28 tests passing on our bundle, 0 failures. It executes **NO** remote calls. Stop and share sanitized output if failed.

## Step 2 — Dedicated staging D1 migration / same-stage-only Worker update

**Only after the local tests pass**, open PowerShell in the *existing*:

`C:\Users\dundi\OX-Novels-B9.2-TEST\local-player-b9.2\step-c-cloudflare-stage`

Make sure `wrangler.toml` is still the previously verified configuration, with:

- `name = "ox-b92-step-c-synthetic-stage"`
- `STAGE_MODE = "synthetic-only"`
- `STAGE_KV` = your **dedicated Step C** KV namespace
- `STAGE_DB` = `ox-b92-step-c-synthetic-db`
- no routes/custom domains/cron or Player bindings.

Commands (only inside the isolated staging directory):

```powershell
npx.cmd wrangler whoami
npx.cmd wrangler d1 migrations list ox-b92-step-c-synthetic-db --remote --config wrangler.toml
```

The **only new pending migration** should be `0002_stage_sync_signals.sql`. If it lists unexpected migrations, STOP. When verified:

```powershell
npx.cmd wrangler d1 migrations apply ox-b92-step-c-synthetic-db --remote --config wrangler.toml
npx.cmd wrangler deploy --config wrangler.toml
```

This updates the **existing staging Worker ONLY**, not `listen` and not `oxnovels.top`. Its `/health` response is unchanged and must still say `publicationDisabled:true, driveAccess:false, playback:false`.

## Step 3 — At most ONE actual end-to-end live handoff (separately after Step 2)

This step **does perform a read-only Drive scan**, similar in duration to the Step A run you already performed. It makes a tiny *staging* D1 journal write but no catalog update. It should only be run once per validation, not as an automatic loop.

To avoid leaking credentials to new terminals, use the **same PowerShell session** that holds the stage-only admin token. If the old `$stageToken` still exists, keep it. If it was cleared or the PowerShell session was closed, safely **rotate the stage-only Worker secret** (not the production Player secret):

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$stageToken = [Convert]::ToBase64String($bytes)
$stageToken | npx.cmd wrangler secret put STAGE_ADMIN_TOKEN --config wrangler.toml
```

Do NOT paste `$stageToken` or its output into chat. If the secret is already in your current session, skip rotation.

Then set variables **in that same PowerShell window** and run the BAT via PowerShell (rather than double-clicking from File Explorer, which may not inherit these environment variables):

```powershell
$env:B92_STEP_C_URL = "https://ox-b92-step-c-synthetic-stage.ox-audio-player.workers.dev/"
$env:B92_STEP_C_TOKEN = $stageToken
& "..\step-d-bridge\B9.2-STEP-D-LIVE-SIGNAL-ONCE.bat"
```

The tool preflights the upgraded staging Worker BEFORE accessing Drive. For unchanged baseline it should record exactly `UNCHANGED`, *without* preparing a new catalog. For a true change, it creates a **PRIVATE LOCAL** catalog and records only `CHANGE QUARANTINED`; it NEVER uploads or activates that catalog.

After completion:

```powershell
Remove-Item Env:B92_STEP_C_TOKEN -ErrorAction SilentlyContinue
Remove-Variable stageToken,bytes -ErrorAction SilentlyContinue
```

## Failure handling

- Error before Drive: staging authentication, wrong host, wrong mode, or migration/deployment missing. **No Drive reads or D1 writes.**
- Drive read incomplete, mismatched two passes, or candidate build invalid: **no staged signal**, no publication and existing baseline unchanged.
- HTTP timeout/ambiguous D1 acknowledgement: **do not blindly retry**; the signal may have been written. A future outbox/retry mechanism needs stable persisted nonces. Stop and ask for a targeted check.
- A successful signal is **not** a publication permit; snapshot consistency, global KV propagation, concurrency, CPU p99 and Player grace behavior are still blockers.

## Exactly which files this patch changes

- `local-player-b9.2/step-c-cloudflare-stage/src/worker.mjs` — extends existing **synthetic-only** Worker with authenticated signal journal endpoints. All previous synthetic activation endpoints kept.
- `local-player-b9.2/step-c-cloudflare-stage/migrations/0002_stage_sync_signals.sql` — **one** new staging D1 table, no existing schema changes.
- `local-player-b9.2/step-c-cloudflare-stage/tests/step-d-signal.test.mjs` — new tests.
- `local-player-b9.2/step-d-bridge/src/bridge-core.mjs` — guarded minimal handoff contract.
- `local-player-b9.2/step-d-bridge/scripts/bridge-real-drive-once.mjs` — calls existing Step A scan unchanged and sends one-bit signal.
- `local-player-b9.2/step-d-bridge/tests/bridge-core.test.mjs` — new tests.
- Two `.bat` files in `step-d-bridge`, plus this README.

**Intentionally not modified:** Step A resolver/source, baseline, secret/config files, Player B, 242 catalogs, main website, production worker routes, production migrations, static catalog generator, stage KV blobs, Step C `activation-core.mjs`, Step C existing migration, Wrangler production config.
