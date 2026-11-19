# OX B9.2 — One-story REAL staging catalog preparation

**LOCAL ONLY. Nothing in this package deploys, publishes, writes to Google Drive, or edits the 242 original catalogs.**

## Apply

1. Back up `C:\Users\dundi\OX-Novels-B9.2-TEST` (the TEST directory only).
2. Extract this ZIP at the root of `C:\Users\dundi\OX-Novels-B9.2-TEST`, preserving paths.
3. Leave these existing files unchanged: `local-player-b9.2/staging/resolver-stage.local.json`, `local-player-b9.2/staging/stage-story-baseline.local.json`, `local-player-handoff/.env.player-handoff`, `.dev.vars` and `.dev.vars.live-backup`.
4. Run `local-player-b9.2\staging\B9.2-PREPARE-ONE-STORY-LOCAL.bat`.
5. Share **console output only**. Do not upload the private candidate, baseline, config or key.

## What this does

- Identifies the one staging root among stories in the existing localhost D1 database (without changing it).
- **Fast path:** compares the existing private `local-audio-lab/cache` raw catalog to the signed baseline produced by your successful *real* staging Drive audit. If every keyed folder and track metadata record matches, prepares the catalog **locally with zero new Apps Script requests**.
- **Fallback:** if cached metadata does not match the saved baseline, performs two complete, nonce-bound *read-only* traversals through the separate staging Apps Script. Both passes and the signed baseline must match before preparation.
- A missing, forged, or mismatched baseline never authorizes preparation.
- Reads the **existing** B5 handoff encryption key locally (does not edit or print it), and verifies it can decrypt an existing published track token for the selected story **before** connecting to Drive.
- Builds B5-compatible folder keys and AES-256-GCM `t1` track tokens with next/previous pointers.
- Decrypts and validates all encrypted track tokens locally before writing a *prepared* JSON file under `local-player-b9.2/staging/_PRIVATE_PREPARED_DO_NOT_DEPLOY/`.
- Writes no raw file or folder IDs in the prepared JSON, and no public manifest or Player assets are touched.

## Important safety boundary

Matching cached metadata to a previous authenticated audit, or matching two fresh Drive traversals, is **not** proof of an immutable Drive snapshot. This tool is a **local format/compatibility preparation test**, not approval for publishing a catalog. No isolated KV publishing or actual Player playback is performed by this patch.

If Drive metadata differs from the saved baseline, the tool stops with `BASELINE_CONTENT_CHANGED` after a fresh read-only verification. Run the existing **read-only** audit to update the local baseline only after confirming those changes are legitimate, then rerun the preparation. Do not relax the safety checks.

Intermittent Google ContentService 404s may occur: temporary read-only requests are retried up to three times. If still failing, the tool stops without writing any candidate.

`PLAYER_KEY_MISSING` means the original handoff key isn't present in the TEST copy. Do not paste the secret into chat or change the live Worker key.

## Expected results

For the already-verified 534-track/6-child-folder story, expect **7 total folders** and **534 encrypted tracks** if nothing changed. The fast path reports `Resolver requests : 0`. A fallback real-Drive scan may take multiple minutes; it is still read-only.

Do **not** send the private candidate JSON to chat; send only the console summary. It has encrypted IDs but public-facing episode titles.

## After success

The prepared catalog is for inspection and isolated staging compatibility checks only. **Do not copy it into** `local-player-b5/public/catalogs/`, do not execute the ordinary B5 build/deploy command, and do not upload it to Cloudflare.

Next milestone is a disposable staging Player runtime and a no-production publication dry run, followed by CPU/quota verification before considering changes to live systems.

If you see `STATIC_CATALOG_NOT_VERIFIED` or `PLAYER_KEY_DOES_NOT_MATCH_STATIC`, stop: the test copy must contain its already-working B5 static catalog and matching local key. Do not invent or replace a secret to make this pass.
