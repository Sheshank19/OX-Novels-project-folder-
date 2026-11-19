# OX B9.2 — One-story audit network diagnostic (read-only)

**This replaces only `scan-one-story-readonly.mjs` in your existing B9.2-TEST folder.**
Do not change `resolver-stage.local.json`, Apps Script, `.dev.vars`, Cloudflare, or your production OX folder.

## Install and run

1. Back up the existing `C:\Users\dundi\OX-Novels-B9.2-TEST\local-player-b9.2\staging\scan-one-story-readonly.mjs` file.
2. Extract the ZIP into `C:\Users\dundi\OX-Novels-B9.2-TEST`, preserving its folder structure; replace **only** the matching scanner `.mjs` file.
3. Run your existing `local-player-b9.2\staging\B9.2-ONE-STORY-READONLY.bat`.
4. Share only the console result. **Never send** your local JSON config, stage secret, test-story Drive URL, endpoint URL, or generated baseline.

## What changed

- Existing authenticated, read-only stage listing requests stay unchanged.
- Each temporary network or retryable HTTP failure gets at most **three total attempts**; each retry is the same read request, including the same folder-page cursor. A small pause between requests reduces bursts.
- A request timeout is extended from 30s to 45s. This does not guarantee that a slow Google Apps Script request will succeed.
- Reports the failed step (`pass 1 child 2/6 page 0`, for example), read attempt, and safe error category such as `TIMEOUT`, `CONNECTION_RESET`, `DNS_FAILURE`, or `HTTP_ERROR`; never the URL, credential, file IDs, or names.
- The private local baseline is saved **only after both complete scans match**. An incomplete audit never overwrites it.
- No Drive writes, catalog publication, D1/KV, Cloudflare Worker changes, or Apps Script deployment.

## What the results mean

- `ONE-STORY READ-ONLY AUDIT PASSED`: two observations matched and a local hash baseline was saved. This is **not** a pinned/atomic Drive snapshot or permission to publish a catalog.
- `STAGING_NETWORK_ERROR` with `TIMEOUT`: the specific read request exceeded its allowed duration; may require investigating Apps Script response times or network routing.
- `STAGING_NETWORK_ERROR` with `CONNECTION_RESET`, `DNS_FAILURE`, or `NETWORK_OTHER`: an HTTP connection could not be completed. Observe the failed step and try the read-only stage probe if needed.
- `STAGING_HTTP_ERROR` with `429`, `503`, etc.: service-side rate limit/transient server response. This patch retries only recognized transient statuses.
- `INVALID_JSON_RESPONSE` or `INVALID_STAGE_PAGE`: stage endpoint/service mismatch or invalid page data; do not force a baseline or skip that folder.
- `NESTED_SUBFOLDER_NEEDS_NEW_STAGE_SCOPE`: the test story has deeper folders than the allowlisted direct-child scope. Stop and review staging access; do not broaden it silently.

Only the existing staging endpoint is contacted. If failure recurs, the sanitized console categories are enough to diagnose the next step.
