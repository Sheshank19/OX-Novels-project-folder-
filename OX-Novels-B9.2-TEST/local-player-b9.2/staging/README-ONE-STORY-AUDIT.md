# OX B9.2 — real one-story inventory (no extra Apps Script deployment)

Your existing read-only staging test succeeded (`ox-stage-readonly-v1`, six child folders, 34 audio tracks in the first child). This kit uses that **same staging resolver**, not the live `lab-v3` production resolver.

## Installation

1. Keep the current staging Google Apps Script project as it is. Do not change the live resolver, Player Worker, OX Worker or `.dev.vars` files.
2. Extract the three files from this ZIP into `C:\Users\dundi\OX-Novels-B9.2-TEST\`, preserving directories. This kit doesn't replace your original staging resolver or config.
3. Keep `local-player-b9.2\staging\resolver-stage.local.json` in place. **Never upload or paste it.**
4. Run `local-player-b9.2\staging\B9.2-ONE-STORY-READONLY.bat`.
5. Send only the redacted console output (folder counts, track counts, elapsed time, status).

## What it actually checks

- Reads the test-story root and **every immediate child folder**, following each folder's paginated continuation until complete.
- Makes two separate complete traversals. A mismatch aborts without changing the saved baseline.
- On first success, creates `stage-story-baseline.local.json` with **keyed HMAC commitments** instead of raw Drive IDs, names or URLs. This is a local file only, not a Cloudflare resource.
- On subsequent runs, reports newly observed, removed and modified tracks / folders since the previous successful audit.
- Rejects incomplete pages, duplicate IDs, unsupported nested folders, unexpected response shape, and overlarge workloads.
- Never changes Google Drive, your 242 published catalogs, KV, D1, Worker routes, or production scripts.

**Critical limitation:** Two matching traversals are *not* an atomic Drive snapshot and do not authorize automatic catalog publication. The baseline represents the first successful test date, **not** the historical content of your 242 published catalogs. Changes seen between runs are observations that still need independent validation before publication.

**Important privacy:** Never share `resolver-stage.local.json`, `stage-story-baseline.local.json`, original Drive IDs, or secrets. The console intentionally shows only totals, timings and reason codes.

If you see `NESTED_SUBFOLDER_NEEDS_NEW_STAGE_SCOPE`, don't broaden the allowlist yourself. The stage currently authorizes only the root and its immediate children. That result means we need to revise this staging-only authorization for that test story before claiming a full inventory.

The request count depends on the number of folders/pages: for six immediate child folders needing one page each, two complete reads typically use **15 requests** (one GET, fourteen POSTs). The previously run single-child probe used three requests.
