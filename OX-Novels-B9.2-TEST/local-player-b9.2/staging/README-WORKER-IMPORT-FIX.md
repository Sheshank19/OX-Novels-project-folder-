# OX B9.2 — Local Player compatibility: ES module import fix

## Confirmed root cause

The B9.2 Worker template imports `./b9-catalog-manager.js`, which in turn imports `./b9-baseline-fingerprints.js`. The previous compatibility checker imported its generated Worker with a `data:` URL; Node.js cannot resolve these relative imports from a `data:` URL. This fails at `B5_WORKER_MODULE_IMPORT` with a TypeError before the actual Player checks run.

## Apply safely

1. Back up your **TEST copy**: `C:\Users\dundi\OX-Novels-B9.2-TEST`.
2. Extract the ZIP into that TEST folder and replace **only** `local-player-b9.2\staging\check-prepared-player-compat.mjs`.
3. Run the existing `local-player-b9.2\staging\B9.2-CHECK-PLAYER-COMPAT-LOCAL.bat`.
4. Share the sanitized console result only. Do not share private catalog candidates, keys, `.env` files, Drive URLs or secret configuration.

## What changed

The checker creates a disposable folder in your system's temporary directory, copies only the already-local **Worker source modules** into it, and imports the Worker as a normal ES module. The temporary folder is removed after import, including on failure.

- No additional network requests, Cloudflare resources, Drive requests or deployment.
- Does not change the actual Worker template, original static catalog or prepared private candidate.
- Does not copy encryption keys or private candidate catalogs to the temporary folder.
- Continues all existing authorization, token, and mock Range-streaming checks. It cannot authorize publishing.
- An error at a **later verification stage** must be investigated separately. Do not relax the check or deploy anything as a workaround.
