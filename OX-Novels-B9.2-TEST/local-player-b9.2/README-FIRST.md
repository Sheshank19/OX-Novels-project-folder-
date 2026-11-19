# OX Novels — B9.2 staged LOCAL source (NOT PRODUCTION READY)

This is a source-only update on top of the user's B9.1.1 working checkpoint. It has **not** been deployed, configured with secrets, or connected to live Cloudflare/Drive here. DO NOT deploy OX production until the user explicitly approves.

## What was added

- B9 catalog override module, staging in KV, private OX snapshot endpoint, queue job handler, and guarded Pacific-midnight scheduled handler.
- Baseline fingerprints for all **242** original published catalogs, generated from matching raw local cache records. Public catalogs and existing B6.5 stream/range/confirmation code are retained.
- Worker Admin actions: status, sync/scan all, per-story refresh. Admin API checks authenticated session and same-origin request.
- OX Admin saving/archiving notifies the Player using a Worker secret; failures don't break the website and nightly reconciliation can catch them.
- Fails closed on missing resources; after final retry, records a failure and leaves a previous working catalog unchanged.

## Critical limitations before ANY production use

1. Cloudflare Workers Free allows **10 ms CPU per invocation**. Encoding thousands of AES-GCM tokens in a single Queue invocation may exceed this limit. Queue-based chunked catalog construction and realistic 2,800-track stress testing MUST be completed before approving production. Treat this package as a **B9.2 development candidate, not an approved release**.
2. MAX_FOLDERS=42 bounds one Queue invocation below the 50 external-subrequest Free cap. Larger/fanout-heavy stories must be split across jobs in the next pass. On overflow, the previous catalog stays active.
3. Static assets do not auto-update. KV immutable blob + active pointer is eventually consistent; new pointers may become visible in one region before the matching blob. The browser should retry transient 503s before launch. Same-session tokens for an older generation stop working after activation, matching the old Player's generation security check.
4. No old-blob garbage collector yet; KV metadata storage must be monitored against the 1 GB Free limit.
5. The local setup leaves **B9_SCANNER_ENABLED=false**, so Cron and Admin cannot initiate a scan until deliberately enabled after tests. Queue messages are retried while disabled. Do not set it to `true` on production without explicit approval.
6. Queue consumer and WebCrypto behavior need to be tested on **a separate staging Worker/Cloudflare account**, with mocked Drive lists, before changing the current deployed Player.
7. Current Admin screen supports Scan All / individual refresh but lacks complete per-run historical summaries and an automated Admin notification integration. Those should be finished before calling B9.2 complete.

## Current Cloudflare Free allowances, verified 2026-10-09

- Workers: 100,000 requests/account/day; **10 ms CPU per invocation**; 50 external fetch subrequests per invocation.
- KV: 100,000 key reads/day; 1,000 writes/day; 1 GB storage; maximum value 25 MiB.
- Queues: 10,000 operations/day; free message retention 24 hours; one read+write+delete often equals 3 operations.
- Cron: 5 triggers/account, UTC schedule. We define **07:00 UTC and 08:00 UTC** and gate on the *actual* America/Los_Angeles hour; only one runs at Pacific midnight across DST.
- No resource or account plan upgrade is required by these settings. Usage above a Free quota fails; do not upgrade/pay to bypass this safeguard.

References: https://developers.cloudflare.com/workers/platform/limits/ ; https://developers.cloudflare.com/kv/platform/pricing/ ; https://developers.cloudflare.com/queues/platform/pricing/ ; https://developers.cloudflare.com/workers/configuration/cron-triggers/.

## Setup (do not execute without permission)

1. Make a full local backup. Leave `.dev.vars` / `.dev.vars.live-backup` untouched.
2. On **Player Account B**, create KV namespace `ox-player-b9-catalogs` and Queue `ox-player-b9-scans` using Free plan dashboard or Wrangler. **No** R2, no paid plan.
3. In your local copy run `local-player-b9.2/CONFIGURE-B9.2-FREE.bat` and enter the new namespace ID. It will modify only `local-player-b5/wrangler.jsonc`, making a backup, not deploy anything.
4. Player Worker secrets needed: `OX_PLAYER_SYNC_KEY` (same random 32-byte+ key on BOTH OX and Player), `B9_RESOLVER_URL`, `B9_RESOLVER_SECRET`. Keep existing `OX_HANDOFF_KEY` and `PLAYER_ADMIN_PASSWORD` unchanged. Never paste secrets into chat or commit them.
5. The resolver values come from the existing private `local-audio-lab/config/resolver.local.json`; do not add that file to a public ZIP.
6. Add `B9_OX_LIBRARY_URL=https://oxnovels.top/api/internal/player-library` as a Player environment value; its URL itself isn't secret. **Production OX must expose the B9.2 endpoint before remote scanning can work.** This requires explicit approval of an OX deployment and cannot occur in the test-only phase.
7. Build and deploy only to a **staging copy** initially, using a separate Wrangler name, resources and endpoints. Verify all failure/retry, access-control, new-folder, replaced-drive-link, deletion, KV-quota and heavy-catalog cases first.
8. Only after successful tests and explicit separate approval for both Workers consider replacing Player and eventually main oxnovels.top.

## ZIP install

Copy included files into the corresponding relative paths of the user's B9.1.1 working folder. This ZIP deliberately omits secrets, node_modules, static catalog assets, databases and source backups. It is **not** a complete stand-alone repository. Do NOT overwrite missing sensitive files or delete originals.

## Important fallback

Main OX production is not modified, and the already-working local Protected Player ON/OFF toggle is not changed. The B6.5 range/Drive confirmation fix remains intact in the Player Worker source.
