# OX B9.2 — Step B: versioned catalog activation and rollback (offline staging implementation)

## Purpose

Step A passed on real Google Drive: 7 folders including root, 534 tracks, only 18 requests when unchanged. Step B implements a **separate, reusable activation transaction module** with immutable catalog blobs, guarded pointer revisions, a 30-minute previous-generation grace period, asset digest verification and rollback.

**This is NOT a Cloudflare KV/D1 implementation and is NOT safe to deploy.** The BAT uses an in-memory transaction adapter only; a future isolated Cloudflare staging deployment must wire this to a real atomic D1 compare-and-swap mechanism and independently validate KV eventual consistency. Do not paste any secrets or private JSON files into chat.

## Install

1. Make a backup of `C:\Users\dundi\OX-Novels-B9.2-TEST`.
2. Extract the patch ZIP into the existing TEST folder, retaining all relative paths.
3. Do not modify `resolver-stage.local.json`, `stage-story-baseline.local.json`, `.env.player-handoff`, `.dev.vars`, `.dev.vars.live-backup`, Cloudflare resources, Apps Script, or original catalogs.
4. Run `local-player-b9.2\staging\B9.2-STEP-B-LOCAL-REHEARSAL.bat` **once**. It should complete in seconds, no Google Drive requests.
5. Paste the sanitized summary; do not share private candidate files, Drive IDs, catalog content or access URLs.

## Actual implemented code

- `b92-activation-core.mjs`: portable activation transaction logic over four storage-adapter methods: `putImmutable`, `getBlob`, `getPointer`, `compareAndSwapPointer`. Candidates are stored by SHA-256 content address; a pointer changes only with expected revision. Previous version is retained. Rollback validates the target before switching. Asset reads validate digest + generation + story. All APIs marked *rehearsal* require explicit rehearsal flag.
- `b92-step-b-rehearsal.mjs`: loads the existing *private prepared candidate* and static B5 catalog, verifies their encrypted tokens with the local key, and exercises promotion/rollback against an isolated in-memory store. Files are read-only and logs are redacted.
- `B9.2-STEP-B-LOCAL-REHEARSAL.bat`: Windows entrypoint.
- `b92-step-b-activation.test.mjs`: targeted local tests including concurrent pointer conflict, missing/corrupted blob, refusal to rollback to unreadable catalog, generation grace, wrong source/story and absent rehearsal gate.

## Restrictions / open issues before Cloudflare staging

- The prepared candidate is labelled NOT PUBLISHABLE. Two matching Drive scans are not an atomic snapshot proof. This rehearsal does NOT make the candidate publishable.
- Existing Worker currently rejects old generation track tokens immediately after activation. The grace period is **logic only** until it is integrated into the Worker and tested with valid listening sessions. Keep old generation tokens session-protected; never allow expired sessions to bypass access checks.
- KV propagation is eventually consistent. Read-back from one point is NOT a guarantee that users in all regions can read the new blob after a pointer switch. A separate per-worker fallback and staged visibility test are required.
- Cloudflare KV does not provide atomic compare-and-swap; a **D1 conditional update/transaction** or comparable single-writer protocol with strong guarantees is required for production activation.
- No nightly all-242 scheduler or new-story/deletion lifecycle is wired in. Cloudflare Free quotas and CPU are not measured.
- Never roll this patch into the production Worker by copying the module without a reviewed staging adapter and protection checks.
