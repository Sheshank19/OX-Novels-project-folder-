# B9.2 one-file M4A preview diagnostic — local only

Purpose: Determine whether Sample 3 M4A is blocked by localhost preview's bounded-range policy, quota or upstream handler, or is received but cannot be decoded by the browser. This is a **diagnostic**, not an M4A streaming fix.

1. Close the existing preview BAT window before updating this file (this also rotates the local access token when restarted).
2. Back up your `OX-Novels-B9.2-TEST` folder.
3. Extract this ZIP into `C:\Users\dundi\OX-Novels-B9.2-TEST`, preserving folders and replacing ONLY `local-player-b9.2/staging/preview-real-audio-local.mjs`.
4. Run existing `local-player-b9.2\staging\B9.2-REAL-AUDIO-LOCAL-PREVIEW.bat` once.
5. Select Sample 3 (M4A) once and press Play. No need to replay MP3 samples. Paste only the new `Preview request`, `Preview rejection`, `Real audio request` statuses and the browser media code; **DO NOT** paste the localhost URL (it contains a temporary access token), Drive IDs, keys, or any `.json` config.

Results interpretation:
* `Preview rejection : M4A / RANGE_START_ABOVE_8_MIB` = browser needs a later offset than the local preview allows.
* `Preview rejection : M4A / UNSUPPORTED_BROWSER_RANGE` = unsupported Range header (e.g., suffix range).
* `Preview rejection : M4A / REQUEST_OR_TRANSFER_BUDGET_EXHAUSTED` = local preview limit, not Cloudflare quota.
* `Real audio request : FAILED / M4A / Player HTTP ...` = Drive/stream handler issue; share the safe reason only.
* `Real audio request : HTTP 206 / ... / M4A` with browser error = received bytes but could not start playback in this limited local preview; further file-layout/codec investigation is needed.
* No M4A request/rejection output and browser error = browser did not issue a usable fetch; check browser media support/error code.

No Drive writes, Cloudflare calls, Apps Script requests, catalog publishing or Player deployment. One M4A play attempt can make real Drive **audio reads**. Stop server after the test; do not publish private candidates.
