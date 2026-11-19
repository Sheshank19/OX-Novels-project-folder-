# OX B9.2 / Step I — Player generation-aware **SHADOW GATE**, OFFLINE ONLY

## Why this exists

The existing B5/B6.5 Player already streams audio. **Do not replace its player, Drive transport or on-site UI.** The existing `resolveProtectedTrack` obtains the story catalog from static `CATALOG_INDEX` and returns HTTP 409 whenever a token's generation does not match that one generation. A future catalog pointer switch alone would therefore reject already-open player tabs.

This patch implements a **pure, local shadow contract** for selecting either the current catalog or its immediate previous catalog for a limited grace window. It demonstrates the needed catalog selection and authorization logic; it **does not patch** `listen`, deploy any code, send HTTP requests, fetch audio, migrate KV/D1, upload a private catalog, create a production route or approve publication.

## Install

1. Keep the original TEST folder backed up. Extract this ZIP into `C:\Users\dundi\OX-Novels-B9.2-TEST` preserving paths.
2. Only files under `local-player-b9.2\step-i-player-shadow` are added. The existing `local-player-b9.2\staging\catalog-compat.mjs` and `b92-activation-core.mjs` from Steps A/B are read but **not changed**.
3. Run `local-player-b9.2\step-i-player-shadow\B9.2-STEP-I-LOCAL-TEST.bat`.
4. Expected: 13 tests passed, 0 failed; `STEP I LOCAL SHADOW GATE PASSED - NO DEPLOYMENT`.
5. Send only the console output. Do not send your actual catalog JSON, protected tokens, secret, Drive IDs, or local configuration.

No reason to rerun `B9.2-STEP-H-PRIVATE-LOCAL-ONCE.bat`. It properly reported the current story is unchanged and lacks the sealed Step E change receipt.

## What is verified in the offline harness

- A new story view selects the D1-pointer **current** generation.
- Old, already-open encrypted `t1` track keys can resolve the **previous** generation only during its bounded grace window, subject to existing authentication/entitlement and same-story/source checks.
- Every stream attempt still requires an upstream-authenticated, entitled session; unauthenticated tokens cannot bypass that prerequisite.
- The exact requested token must belong to the selected, fully validated catalog.
- Invalid ciphertext, foreign story, missing or tampered blobs, and stale generations fail closed.
- A rollback reverts the active catalog and temporarily retains the replaced version.
- Consecutive rapid promotions are blocked in the offline model while previous grace is active, so a second switch cannot drop a still-supported generation. A real D1 compare-and-swap must enforce this **atomically**.
- Tests use synthetic story IDs, audio track IDs and a test-only key; **no real content**.

## IMPORTANT: blocked live-integration conditions

- This local prototype uses an O(N) validation and membership search of the entire catalog per simulated track request. **DO NOT DEPLOY AS-IS**. It would likely exceed the Worker Free 10 ms CPU limit on larger catalogs. A staging adapter needs immutable bounded indexes or preverified per-generation membership, read caching, strict key sizing and measured p95/p99 CPU under representative playback/Range traffic.
- The demo uses a 30-minute old-generation grace. That does **not** guarantee uninterrupted playback for listeners who remain in an old tab for hours or 24 hours; a later version must define/verify session TTL, grace expiry, retention, and upload frequency before go-live.
- If a file is physically deleted from Google Drive, accepting its older catalog token cannot restore the deleted media. Already-buffered bytes may play; subsequent source requests may fail.
- B5 browser boot metadata, static catalog path loading and stream `resolveProtectedTrack` must eventually use the new generation-aware reader **together**. Updating a D1 pointer without updating both is unsafe.
- The upstream caller must cryptographically verify the real Player session; `authenticatedSession` in this prototype is a trusted input fixture, **not a cookie authenticator**. The real entitlement process must never be weakened or skipped.
- KV replication is eventually consistent, D1 CAS must enforce expected revision and grace conditions, and all previous-blob retention must be verified under real runtime. No global consistency guarantee is established.
- Step E's two matching Drive scans are **not an atomic snapshot**, and its sealed receipt has `publicationAllowed:false`. This patch cannot and does not lift that blocker. No real protected catalog is eligible for publication.
- The production `listen` Worker, 242 static catalogs, local `.dev.vars`, `.dev.vars.live-backup`, Cloudflare staging Workers, D1/KV, and Google Apps Script all remain unchanged.

## Next important engineering action (not part of this patch)

Build an **isolated staging Player adapter**, retaining existing B6.5 playback logic, to consume a bounded, verified current/previous catalog index with cache behavior that fits the Free CPU limit. Test Range requests with old/new generation tokens under the real staging runtime (not the live Player). Review snapshot safety and require separate human approval before real protected catalog staging or activation.
