# OX B9.2 — protected Player ONE-STORY website canary

Scope: the MAIN website Worker (`oxnovels.top`) only. It does not alter Dodo, PayPal, Player B, scanning, D1, or any Google Drive data.

- Only `a-dragon-s-revenge` is switched to the already-deployed protected Player. All other stories retain their current Drive routing.
- The old existing `/api/story/:id/open` authentication / entitlement checks remain intact. The new `/player-launch` route **independently repeats** them.
- The website uses `OX_HANDOFF_KEY` to create the same short-lived AES-GCM token Player B already accepts. Never rotate Player B's key: doing so would invalidate encrypted static track tokens.
- The website does not have `OX_HANDOFF_KEY` yet, based on the earlier screenshots. Recover the original key from `OX-Novels-B9.2-TEST\local-player-handoff\.env.player-handoff` and set it only on the MAIN website Worker. Never generate a replacement key, and never paste the value into chat.
- If you cannot prove the local file is the same original key used to deploy `listen`, STOP before activation.

## Controlled deployment (do not overwrite the entire production source)

1. Back up your current live main Worker code / version and check the latest main production code still has `/api/internal/player-library` (installed earlier) and Dodo Payments handlers.
2. FIRST add the original known-good `OX_HANDOFF_KEY` from your PC **only to the main website Worker** as a Secret. Keep all Player B secrets unchanged. Changing this main Worker secret deploys a new version, but does not switch story delivery yet.
3. Insert `WORKER-HELPER.js` once at top-level, immediately before `var index_default = {` in the current main Worker editor source.
4. Insert the active lines of `WORKER-ROUTE.txt` just before the existing `const openMatch = pathname.match(...)` line.
5. Replace ONLY the existing final `return json({ url: story.drive_url });` line inside the `/open` handler, using `WORKER-OPEN-REPLACEMENT.txt`.
6. Deploy the MAIN Worker source, leaving all bindings and other secrets unchanged. The one-story protected launch intentionally fails closed if the handoff key is invalid.
7. Log in as an authorized test customer and open `A Dragon's Revenge`. It should POST directly to Player B `/handoff`, then redirect to `/listen/a-dragon-s-revenge`. Verify one episode plays. Other stories should still open Drive.
8. If the test fails, revert the main Worker code to its previous version; this restores the website's original `/open` behavior. No D1 changes or Player B changes are necessary.

CAUTION: Do not apply the old entire `PATCHED-OX-NOVELS-PRODUCTION-BUNDLE.mjs` from another ZIP. It predates recent production changes.

## What this patch DOES NOT do

This is the protected Play handoff, NOT automatic catalog publication. B9.2 still needs trustworthy changed-content validation and promotion/rollback. The scheduled audit remains read-only.
