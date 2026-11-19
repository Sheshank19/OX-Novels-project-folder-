# OX B9.2 Step E — REAL change → protected catalog → LOCAL quarantine

**THIS PACKAGE DOES NOT DEPLOY OR ACTIVATE ANY CATALOG.** It is a next-stage integration of existing Steps A and B, NOT a replacement audio Player.

## Scope and safety

- The existing Google Apps Script **staging** resolver is read-only, paginated and nonce-bound.
- An unchanged fresh story scan stops after one full pass. No candidate or receipt is created.
- A change relative to the **saved HMAC-sealed one-story audit baseline** triggers a second complete real Drive pass. Any inconsistent/incomplete pass aborts.
- The new candidate uses the existing B5 `t1` protected track token format. It is independently token-validated and compared against the current local static Player catalog; if content is identical, a generation-only update is suppressed.
- The *actual changed* candidate is rehearsed **in memory** with the Step B guarded promotion, old-generation grace period and rollback logic.
- Only then are a private protected catalog and a keyed, integrity-sealed quarantine receipt written in a separate **local** private directory. The receipt contains hashed evidence/counts, no raw names or IDs.
- The receipt explicitly says `publicationAllowed:false`, `pinnedSnapshotProven:false`, `requiresHumanReview:true`. **Two matching Drive passes do not prove an atomic snapshot.** This implementation offers no publishing approval or endpoint.
- This does **not** send the candidate or hashes to Cloudflare. It does not change the existing `ox-b92-step-c-synthetic-stage` Worker, KV namespace, D1 pointer or production Player.
- It does not read or modify `.dev.vars` or `.dev.vars.live-backup`. It does not overwrite the saved audit baseline.

## Install

1. Back up your `C:\Users\dundi\OX-Novels-B9.2-TEST` folder.
2. Extract ZIP into that **TEST** folder preserving paths. There are only new files under `local-player-b9.2\step-e-quarantine`.
3. Keep the existing Step A scan files and Step B `local-player-b9.2\staging\b92-activation-core.mjs` present. Do **not** alter secrets, story configuration or deployed resources.
4. First double-click `local-player-b9.2\step-e-quarantine\B9.2-STEP-E-LOCAL-TEST.bat`.
5. Expect `12` passing **offline** tests. They use fabricated folders and media metadata, not real audio or Google Drive.

## Optional real one-story scan

`local-player-b9.2\step-e-quarantine\B9.2-STEP-E-REAL-DRIVE-ONCE.bat`

This DOES use the existing staging resolver for metadata requests. If the selected story is unchanged (as it was in your last successful B9.2 test), it will only tell you `STEP E UNCHANGED — NO CANDIDATE GENERATED` and will **not** test the changed-case live path. Running it is optional; do **not** create dummy content on a production/customer Drive story to force a change.

If a legitimate new episode is added in future, run this once. Upon two matching passes and successful checks, it writes the **private** pair under:

`local-player-b9.2\staging\_PRIVATE_STEP_E_QUARANTINE_NO_UPLOAD`

Never upload, deploy, or share this directory. Do not share `.env.player-handoff`, resolver URLs, Drive IDs, protected tokens or local config. Logs deliberately omit them.

## What is still blocked

No automatic publication, no actual Cloudflare catalog integration, no snapshot guarantee, no live Player pointer switch and no 242-story schedule. The existing synthetic-only staging Worker stays synthetic-only. The next controlled milestone should implement a **separate, gated Player staging reader** and test KV consistency / CPU on Cloudflare, with explicit deployment approval and an agreed real-catalog data policy.
