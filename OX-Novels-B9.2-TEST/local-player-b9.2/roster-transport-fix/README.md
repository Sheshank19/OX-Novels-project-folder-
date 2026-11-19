# OX B9.2 roster transport fix — existing `listen` Worker

The five-minute cron is firing, but `fetchTrustedRoster` fails before the D1 cycle is seeded. Browser/PowerShell authenticated GET worked, so the fault is specifically in **Worker-to-Worker roster retrieval**; the prior implementation hid whether the cause was fetch transport, redirect, HTTP 401, etc.

This local-only patch makes exactly two changes:
1. Adds Cloudflare's `global_fetch_strictly_public` compatibility flag to the existing Worker's `wrangler.jsonc`, preserving other flags/bindings.
2. Changes the roster fetch failure to `OX_ROSTER_FETCH_FAILED` (network/redirect/timeout) or `OX_ROSTER_HTTP_NNN` (received HTTP status). It does **not** log secret values, URL tokens, Drive IDs, or response bodies.

No main website changes, new resources, D1 migrations or scans during installation. Existing scheduled scanner stays read-only; publication remains disabled. Existing static audio catalog and streaming code are not edited.

## Steps

1. Extract ZIP into `C:\Users\dundi\OX-Novels-B9.2-TEST`.
2. Run `local-player-b9.2\roster-transport-fix\B9.2-APPLY-ROSTER-TRANSPORT-FIX-LOCAL.bat`.
3. From `local-player-b5`, run `npx.cmd wrangler deploy --dry-run`. If it succeeds, run `npx.cmd wrangler deploy` once. This is a real deployment of the existing Player, so keep the previous version available for rollback. No secrets need replacing.
4. Observe at most one next scheduled tick using `npx.cmd wrangler tail listen --format pretty`. If a new error appears, its code should identify the next action without further blind changes. If a scan succeeds, check authenticated Admin audit-status for a cycle.

If playback breaks, roll back to the previous working Cloudflare Worker version; the local installer also saved exact prepatch files in `_B92_PLAYER_INTEGRATION_BACKUPS`.

No automatic catalog publication is enabled by this change. This is NOT proof that the full sync or Player navigation integration is complete.
