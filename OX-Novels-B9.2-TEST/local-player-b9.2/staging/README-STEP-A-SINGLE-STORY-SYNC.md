# OX B9.2 — Step A: real Drive to protected catalog integration (local staging only)

**This is implementation of a single-story staging scan/generate pipeline, not automatic Cloudflare publishing.** It does not change the working production Player, OX website, Apps Script, KV, D1, Queue, 242 static catalogs, or the encrypted handoff key.

## Install on Windows

1. Keep the backup of `C:\Users\dundi\OX-Novels-B9.2-TEST`.
2. Unzip into that TEST folder, preserving relative paths; overwrite the existing `prepare-one-story-catalog.mjs` file when prompted (the **only edit** is exporting the existing safe request client so the new pipeline can reuse it).
3. Keep these private files untouched: `local-player-b9.2/staging/resolver-stage.local.json`, `local-player-b9.2/staging/stage-story-baseline.local.json`, `local-player-handoff/.env.player-handoff`, `.dev.vars`, `.dev.vars.live-backup`. Do not paste their contents or URLs into chat.
4. Run **`local-player-b9.2\staging\B9.2-SYNC-ONE-STORY-LOCAL.bat`**. (Do not run the old `B9.2-ONE-STORY-READONLY.bat`.)
5. Share only the sanitized console summary, excluding any local access URLs.

## Behavior

- Loads the saved authenticated, HMAC-sealed one-story baseline for the currently configured staging root, the matching localhost D1 story, the local B5 encryption key and static Player catalog. All prerequisites must pass before real Drive reads.
- Connects **only** to the separate staging Apps Script `/exec` (never the production `lab-v3` endpoint), checks `requestBinding: nonce-echo-v1`, reads all root + immediate child folders using authenticated, bounded `list_children_page` with continuation cursors and 128-bit per-request nonces. Uses existing three-attempt retry and Google redirect handling.
- If **one complete new read** matches the saved baseline, prints `UNCHANGED — NO CATALOG BUILT`; skips second pass and catalog creation. This saves about half the Drive requests compared with the older two-pass audit. It still takes real Google Drive time.
- If it differs, makes **another complete fresh read**. The two must match in all keyed folder and episode metadata. A failure or mismatch stops without writing a new candidate.
- On a confirmed observation of a change, builds and validates a **private protected catalog** in `local-player-b9.2/staging/_PRIVATE_PREPARED_DO_NOT_DEPLOY/`, containing encrypted `t1` tokens, not raw Drive IDs. The previous baseline remains unchanged so every subsequent new run compares against the same previously verified state.
- Prints only counts and safe status labels; no Drive IDs, folder names, tokens, secrets, or URLs. Never updates the saved auditor baseline or publishes an active catalog.

## Important limitations

A read-only two-pass match **is not a pinned/atomic Drive snapshot**. This tool does **not** authorize live catalog activation. It is a real network integration of the staging reader and catalog generator, not yet the eventual Cloudflare Queue/KV implementation.

Google Apps Script ContentService redirects may intermittently return 404 and/or stale responses. Bounded retries handle some instances; persistent errors abort safely. One unchanged-story run should use approximately 18 requests (GET + 17 metadata pages) and may still take minutes; real counts depend on current Drive contents. A changed scan is typically 35+ requests. These local requests use no Cloudflare Workers, KV, D1 or Queues quota.

If you have not actually changed the test story since the last successful audit, **UNCHANGED is the expected result**. You do not need to add dummy audio or repeat the audit BAT. The new implementation is the deliverable.

## Patch contents

- `local-player-b9.2/staging/sync-one-story-local.mjs` — new read-only staging integration.
- `local-player-b9.2/staging/B9.2-SYNC-ONE-STORY-LOCAL.bat` — Windows entrypoint.
- `local-player-b9.2/staging/prepare-one-story-catalog.mjs` — exports the existing `requestClient` function; otherwise unchanged.
- `local-player-b9.2/tests/b92-step-a-sync.test.mjs` — synthetic offline tests.
- This README.

No Cloudflare deploy command, credentials, private catalog or external dependency is included.
