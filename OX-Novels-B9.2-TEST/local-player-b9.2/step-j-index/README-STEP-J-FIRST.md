# OX B9.2 — Step J: INDEXED PLAYER GENERATION SHADOW / LOCAL ONLY

## Why this patch exists

Your 13/13 Step I tests passed. However, Step I repeatedly verifies a full catalog and scans all its tracks for each Range/episode request: that grows with catalog size and is **not suitable for deployment** under Cloudflare Free's Worker CPU limit.

Step J is a targeted implementation of a **single indexed SQL lookup per authorized track request**. It is based on the real B5 `resolveProtectedTrack` integration seam (signed session, AES-GCM `t1` token, story and generation checks), without editing or redeploying that Worker. It is not a replacement Player.

## New files — no existing files overwritten

- `src/build-index.mjs`: an offline builder validates a complete encrypted catalog ONCE and extracts SHA-256 hashes of protected track tokens (no raw Drive IDs or token strings in index rows).
- `src/index-gate.mjs`: WebCrypto-compatible, read-only authorization gate; caller must provide authenticated session, fresh entitlement verification, cryptographic `t1` decryptor, and D1 reader. First verifies the session/entitlement/token; only then computes a SHA-256 token digest and looks up matching current or previous generation.
- `sql/STEP-J-LOCAL-INDEX-SCHEMA.sql`: schema for an in-memory local SQLite validation, not a live D1 migration.
- `tests/step-j.test.mjs`: actual SQLite query planner and index membership checks, plus security/failure cases.
- `B9.2-STEP-J-LOCAL-SQLITE-TEST.bat`: runs the new tests without network or filesystem changes outside OS temp/SQLite in memory.

## Install and run

1. Back up `C:\Users\dundi\OX-Novels-B9.2-TEST`.
2. Extract this ZIP into that TEST folder, preserving paths. It adds ONLY the `local-player-b9.2\step-j-index` folder.
3. Ensure the prior file `local-player-b9.2\staging\catalog-compat.mjs` from Step A/B is still present.
4. Run `local-player-b9.2\step-j-index\B9.2-STEP-J-LOCAL-SQLITE-TEST.bat`.
5. Expected: **14 tests pass**, 0 fail; `STEP J LOCAL SQLITE TESTS PASSED - NO DEPLOYMENT`.

The test constructs a 534-track and a 535-track **fabricated** catalog with seven folders; it uses a fabricated Player key. It validates 1,069 token-hash membership rows in actual in-memory SQLite. The SQL query plan must report indexed lookups rather than a full catalog scan. Authentication, source version, previous-generation grace, rollback, tampering, missing D1 rows, and D1 exceptions all have bounded, fail-closed behavior. There are **no real story IDs, Drive IDs, user tokens, or player secrets**.

## Free plan and safety limits

- In this design, each accepted track request would perform **one D1 SELECT** (two indexed table probes in the plan), not an O(N) catalog scan. This is an architectural improvement, NOT proof that CPU stays within 10 ms: only an isolated Cloudflare Worker test measuring p95/p99 can establish that.
- Each catalog version needs approximately one D1 membership row per track; this has D1 storage/write cost. The first-time 154,699-track backfill cannot be assumed to fit into the Free D1 daily-write allowance; it would need budgeting, pacing, and measured accounting.
- No Worker deployment, Cloudflare KV/D1 reads/writes, Google Apps Script requests, Drive reads, audio playback or catalog publication happen in this step.
- The SQL schema is **NOT approved for remote migration**, and the test does not link into `listen` or either existing staging Worker.
- The actual B5 session authenticator and user entitlement system remain unchanged; the caller must prove these upstream, not pass unverified boolean claims.
- Index rows may only be committed after full catalog validation and explicit, verified authorization to stage that generation. D1 index availability, atomic pointer CAS, multi-region consistency, snapshot safety, source deletion and previous-generation retention remain unresolved for production.
- Do not upload or activate the real 534-track catalog; it still has no sealed changed-catalog receipt. Do not edit `.dev.vars` / `.dev.vars.live-backup`.

## Next major integration milestone

Run an isolated **synthetic-only** Cloudflare Worker with the same D1 index query under a bounded number of requests to measure p95/p99 CPU, D1 rows-read, and API errors. Keep the two existing staging Workers and production Player unchanged until tested and separately authorized. Then connect the same read-only gate to the Player boot/catalog routing and streaming authorization **together**, with source and rollback safeguards; no pointer-only deployment.
