# OX B9.2 Step F — synthetic-only staging catalog reader

## Scope and security

This patch **only** updates the already separate `ox-b92-step-c-synthetic-stage` Worker in Cloudflare Account B. It is **not** a production Player patch. `oxnovels.top`, the `listen` production Worker, its 242 catalogs, private quarantine candidates, Apps Script resolver, `.dev.vars`, and `.dev.vars.live-backup` must stay unchanged.

The reader accepts **only the two hard-coded synthetic one-track fixtures** already used by Step C and stored in its dedicated KV namespace. It does not accept a catalog upload; does not accept names, IDs, references or generation IDs from a request; does not stream audio or publish catalogs; does not access Google Drive or schedule jobs. It serves a **sanitized summary** of the selected synthetic catalog.

### New authenticated read-only endpoints

- `GET /v1/catalog-preview/current` — load the D1 current pointer, retrieve its versioned KV blob, verify its SHA-256 and fixed synthetic-fixture content, then return the synthetic folder / track summary.
- `GET /v1/catalog-preview/previous` — same, but only if a previous reference exists and its 30-minute grace window has **not** expired; otherwise HTTP 409.

Both endpoints require `STAGE_ADMIN_TOKEN` with Bearer auth, reject browser Origin headers and all query strings, use `Cache-Control: no-store`, and make **no D1/KV writes**. Missing or corrupt KV bytes fail closed with HTTP 503; no fallback to a potentially stale blob. The GET does perform D1 and KV **reads**, which count toward Cloudflare Free allowances when deployed.

`GET /health` includes a safe public marker: `"syntheticCatalogPreview":"read-only"`, to verify the new version is deployed without needing to share secrets.

## Installation

1. Back up only your `C:\Users\dundi\OX-Novels-B9.2-TEST` **test folder**.
2. Extract this ZIP into that test folder, preserving the internal `local-player-b9.2/step-c-cloudflare-stage/...` paths and replacing the matching staging `src/worker.mjs`.
3. **Do not** replace your current `wrangler.toml`; this ZIP contains none. Also do not change any token or secret.
4. Run `local-player-b9.2\step-c-cloudflare-stage\B9.2-STEP-F-LOCAL-TEST.bat`.
5. If the local test passes, in the same stage-only directory verify `npx.cmd wrangler whoami` indicates **OX Audio Player**. Then, if you explicitly choose to update this existing *staging* Worker, run `npx.cmd wrangler deploy --config wrangler.toml`. Confirm the Worker name is exactly `ox-b92-step-c-synthetic-stage` and STAGE_MODE is `synthetic-only`; **never** deploy to `listen` or `oxnovels.top`. No D1 migration is required.
6. Check the staging `/health` endpoint for `"syntheticCatalogPreview":"read-only"`. No secret is needed for `/health`.

The `STAGE_ADMIN_TOKEN` secret normally survives code-only deployments. Do not rotate it merely to deploy. Authenticated remote current/previous checks require the stage-only token to be available locally; if it was cleared from PowerShell, wait for instructions rather than pasting or storing its value in chat.

### What this does NOT prove

It does not activate any real story catalog, verify protected audio playback on Cloudflare, prove KV propagation across geographic regions, prove that every invocation satisfies Free CPU limits, authorize Step E quarantine publication, or enable scanning all 242 stories on a schedule. Those remain separate gates.

### Exit criteria

- Full offline tests pass.
- The correct **synthetic staging** Worker health marker appears after deployment.
- The authenticated remote current catalog returns a one-track synthetic summary after a separate, controlled test.
- Previous generation may legitimately return HTTP 409 if its grace period has expired; this is the **expected safety behavior**, not a reason to promote another catalog.
