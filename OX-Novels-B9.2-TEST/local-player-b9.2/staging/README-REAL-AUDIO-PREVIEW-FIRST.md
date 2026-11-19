# OX B9.2 — Local, real Google Drive audio preview (no cloud deployment)

## Purpose
This is the **next acceptance step after your 534/534 local Player compatibility pass**.
It runs the existing B5/B6.5 Player streaming code on your Windows PC and can retrieve a **small real Range** of an existing story episode directly from Google Drive when you click Play. It never publishes a catalog, edits Drive, or calls Cloudflare or Google Apps Script.

## Install and run
1. Back up `C:\Users\dundi\OX-Novels-B9.2-TEST`.
2. Extract this ZIP **into that TEST folder**, preserving the included `local-player-b9.2\staging\` paths. Replace only matching files from this ZIP.
3. Keep your previously prepared private 534-track candidate in `_PRIVATE_PREPARED_DO_NOT_DEPLOY`. Do not upload or move it.
4. Run `local-player-b9.2\staging\B9.2-REAL-AUDIO-LOCAL-PREVIEW.bat`.
5. A local browser page should open. If not, copy **the local `http://127.0.0.1:...` URL displayed in the BAT window** into your browser. Do not share that token-bearing URL with anyone.
6. Choose **Sample 1 (MP3)** and press Play in the audio player. If it fails, select Sample 2 or Sample 3. Let the BAT window remain open during testing.
7. When finished, close the BAT window or press `Ctrl+C` there to stop the local preview.

## What success looks like
In the browser: `Real audio playback started.` and you can hear real audio.
In the BAT output: `Real audio request: HTTP 206 / ... bytes / MP3` or M4A.
If the BAT says `FAILED (Player HTTP 502, reason: ...)`, do **not** change production or the catalog; the upstream audio source may not support that specific request. Send only that sanitized failure category.

## Privacy and resource limits
- Reads your existing private Player key and candidate locally. Does not print or export them.
- Only exposes loopback `127.0.0.1` with a random temporary access token, and does not reveal raw Drive URLs/IDs to the browser.
- Sends at most 1 MiB in any audio response, accepts audio range starts only through 8 MiB and enforces a 24 MiB total preview transfer budget.
- Uses the current B6.5 Drive audio-fetching and Range logic; may issue several outbound Drive requests when Drive has a confirmation page. Does not consume Cloudflare Workers/KV/D1/Queues or Apps Script requests.
- No catalog/Drive/production writes, no remote Worker deployment, no R2, no new paid resources. Only temporary test modules are written to your OS temp folder and removed.
- The session is created in memory by the LOCAL preview wrapper. This test does **not** validate the complete OX website handoff, browser cookie handling on Cloudflare, Cloudflare's 10 ms CPU limit, or real production concurrency.
- A player may fail to decode an M4A when its metadata is stored near the end of the file; try one of the MP3 samples first. No need to modify the audio file.

## What NOT to share
Do not upload `_PRIVATE_PREPARED_DO_NOT_DEPLOY`, `.env.player-handoff`, `.dev.vars`, `.dev.vars.live-backup`, your staging JSON config, any Drive IDs or the localhost URL's access token.

## Please report only
- `CHECK STATUS` from BAT
- Whether browser displayed `Real audio playback started.` and whether you heard audio
- Sanitized `Real audio request` lines, without the localhost URL

## Next after this passes
A separate *cloud staging* test is still needed to measure Cloudflare runtime CPU, request usage, and real restricted entitlements. Do not deploy the current candidate to your production Player.
