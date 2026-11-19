# OX B9.2 — Google ContentService 404 recovery (local-only)

**Purpose:** Repair diagnostic handling of intermittent HTTP 404 responses after Google Apps Script ContentService redirects; distinguish an Apps Script JSON rejection from malformed successful data.

This replaces only `local-player-b9.2/staging/scan-one-story-readonly.mjs` in your **OX-Novels-B9.2-TEST** folder.

**DO NOT:** edit or redeploy the live/staging Apps Script, change `.dev.vars` / `.dev.vars.live-backup`, edit any secret or `.json` config file, enable the scanner, deploy Workers, or publish a catalog. The original `OX-Novels` folder must stay unchanged.

## Apply

1. Make a local backup copy of the **TEST** folder (or at least the existing `scan-one-story-readonly.mjs`).
2. Extract this ZIP into `C:\Users\dundi\OX-Novels-B9.2-TEST`, preserving paths. Replace the one matching `.mjs` file.
3. Leave `resolver-stage.local.json` untouched and private.
4. Run the existing `local-player-b9.2\staging\B9.2-ONE-STORY-READONLY.bat` **once** and review its sanitized output.

## What changed

- Waits at least 1.2 seconds between staging reads to avoid an overly rapid burst.
- Retries **only** Google redirected content-host HTTP 404 errors, or standard temporary 408/429/5xx errors, up to three attempts total per request with backoff. A direct `/exec` 404 remains a hard failure.
- Reads exactly the same folder, page and cursor on retry. All operations are read-only.
- Stops rather than trusting a JSON response with `ok:false`, reporting `STAGE_REJECTED`. It never displays Google error text or private metadata.
- Stops for a structurally invalid `ok:true` response as `INVALID_STAGE_PAGE` / `PAGE_SCHEMA_INVALID`.
- Reports only the safe request label, HTTP status, Google host class and counters, not URLs, redirect tokens, secrets, names or IDs.
- Keeps the existing local baseline unchanged on every incomplete run. Successful dual-scan equality is **not** proof of a pinned Drive snapshot.

## How to interpret the next result

- `ONE-STORY READ-ONLY AUDIT PASSED`: successful observed two-pass listing; no automatic publishing.
- `STAGING_HTTP_ERROR` with `GOOGLE_CONTENT_404`: redirected Google response remained unavailable after bounded retries. This is consistent with a reported Google ContentService issue. Don't keep rerunning; the account's **staging** Apps Script Executions screen can distinguish successful script execution from response-delivery failures.
- `STAGING_HTTP_ERROR` with `APPS_SCRIPT` and `404`: deployment URL or access issue; no automatic retry.
- `STAGE_REJECTED` with HTTP 200: staging doPost returned `{ok:false}`. Inspect the *staging project's* Executions page for errors (not the live project); don't paste secrets, raw logs, or Drive names into the chat.
- `INVALID_STAGE_PAGE` / `PAGE_SCHEMA_INVALID`: HTTP 200 JSON was structurally incompatible, not necessarily a network error. Do not enable publishing.

Official Apps Script ContentService documentation: https://developers.google.com/apps-script/guides/content
Known intermittent ContentService redirect 404 issue: https://issuetracker.google.com/issues/541915738

This patch has passed five deterministic local scenarios. It has **not** been tested against your staging deployment; your next run is the real compatibility test.
