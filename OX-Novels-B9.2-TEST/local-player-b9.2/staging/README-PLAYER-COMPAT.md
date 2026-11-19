# OX B9.2 — Prepared candidate / actual B5 Worker compatibility, LOCAL ONLY

**Purpose:** Exercise the real B5 Player template with the most recent private prepared catalog in an isolated Node.js run, with Drive audio replaced by **two fake bytes**. This is *not* an actual playback test against Drive and does not prove Cloudflare Free CPU/quotas or Drive snapshot safety.

## Installation

1. Keep a backup of `C:\Users\dundi\OX-Novels-B9.2-TEST`.
2. Extract this small ZIP into the root of that **TEST** copy; preserve the `local-player-b9.2\staging\` paths.
3. Keep `resolver-stage.local.json`, `stage-story-baseline.local.json`, `_PRIVATE_PREPARED_DO_NOT_DEPLOY/`, `local-player-handoff\.env.player-handoff`, `.dev.vars`, and `.dev.vars.live-backup` unchanged.
4. Run `local-player-b9.2\staging\B9.2-CHECK-PLAYER-COMPAT-LOCAL.bat`.
5. Send **only the printed summary**. Never send the private candidate or secret files.

Requires the earlier B9.2 catalog-preparation patch's `catalog-compat.mjs`, its prepared private candidate, a matching static B5 catalog, and Node.js 22+.

## Actual checks

- Reads latest local prepared candidate, decrypts and validates all `t1` track tokens using the already-existing Player key, verifies folder and next/previous pointers.
- Loads **the actual existing** `local-player-b5/src/worker-B5-template.js` with a one-story in-memory index only. Does not change that source file or build a Worker.
- Tests blocked unauthenticated `/listen/` and audio-stream requests, authorized `/listen/` response and its boot metadata, and the old-generation rejection path.
- Replaces `fetch()` with a mock that refuses all non-Google hostnames, and returns **two fake audio bytes** to a `bytes=0-1` request. Confirms the B6.5 streaming path returns `206` and `Content-Range` with no network access. If any unexpected network attempt occurs, the test fails.
- Confirms the already-published static catalog's file hash is unchanged after the test.

## Boundaries

- **No audio file is downloaded or played.** This is an isolated source-code compatibility/safety test, not a proof that the real Player can stream each episode.
- No Workers, KV, Queues, D1, Google Drive or Apps Script requests and no new resources or deployment.
- A matching catalog still lacks a pinned Drive snapshot. **Do not publish or copy the private candidate into `public/catalogs`.**
- Google Drive's transient ContentService errors, real Worker CPU, free quotas, and all 242 stories need separate validation before future rollout.
