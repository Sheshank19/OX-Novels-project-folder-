# OX B9.2 staging-only request binding fix

## Why

The real one-story audit returned HTTP 200 but `FOLDER_ID_MISMATCH` at varying folders/pages. The Apps Script staging handler normally returns the same `folderId` that the incoming authenticated request supplied. One possibility is that an earlier or incorrect response was delivered for another request. The exact mechanism has not been established.

This fix does NOT loosen any Drive/catalog validation and does NOT claim Google Drive snapshot isolation. It binds each POST attempt to a fresh random `requestNonce`, echoed in the staging response. A wrong nonce, folder ID, or page index rejects the response. The local scanner can retry that exact read-only request at most 3 times; the retry uses a new nonce. A persistent mismatch stops and leaves any existing audit baseline unchanged.

## Included files

- `local-audio-lab/apps-script/OX-Audio-Resolver-B9.2-STAGING-READONLY.gs` — complete staging source with nonce echo.
- `local-player-b9.2/staging/scan-one-story-readonly.mjs` — client-side request binding and safe retries.
- `local-player-b9.2/staging/probe-stage.mjs` — basic staging probe updated to send/verify nonce.

## Step 1 — Backup your TEST folder

Back up `C:\Users\dundi\OX-Novels-B9.2-TEST`. Extract the patch into that folder, preserving paths and replacing only the matching development files. Do not copy these into the original `OX-Novels` production project.

## Step 2 — Update only the SEPARATE staging Apps Script

1. Open the already-created Google Apps Script project **OX B9.2 Staging Read Only**.
2. Make sure it is NOT your original live `lab-v3` resolver project.
3. Paste the entire new `.gs` source from the patch into the staging project's `Code.gs`, replacing the previous staging version; Save.
4. Open **Deploy > Manage deployments**, select its existing staging Web App, click **Edit** (pencil), select **New version** and click **Deploy**.
5. Do NOT create a new deployment. Editing the existing staging deployment keeps its `/exec` URL and deployment ID unchanged. Do not modify its Script Properties or access settings.
6. Do NOT edit/redeploy your original resolver or Cloudflare Workers.

Official reference: https://developers.google.com/apps-script/concepts/deployments

## Step 3 — Confirm, then run once

Keep `local-player-b9.2/staging/resolver-stage.local.json` exactly as it is. No new secret, URL, or folder ID is needed.

Run the existing `local-player-b9.2/staging/B9.2-ONE-STORY-READONLY.bat` once. Send only its sanitized console output.

Possible results:

- `ONE-STORY READ-ONLY AUDIT PASSED`: Both passes matched; local keyed-hash baseline created/updated. This is not a pinned Drive snapshot.
- `STAGING_RESOLVER_UPGRADE_REQUIRED`: The `/exec` deployment still serves old source; check you updated the existing staging deployment to a **new version**.
- `STAGING_RESPONSE_BINDING_FAILED`: Three response attempts did not match request marker, folder and page; baseline remains unchanged. Console shows only the mismatch category, never IDs/nonces.
- `INVALID_STAGE_PAGE`: Some other page-schema rule failed; baseline remains unchanged. Do not bypass validation.
- `DRIVE_CHANGED_DURING_TWO_PASSES`: Listing changed between passes; do not publish a catalog.

No automatic catalog publication exists in this patch. It does not write Google Drive, Cloudflare or the production website. The only local write is the keyed-hash baseline after a fully successful two-pass audit.

## Safety

NEVER upload `resolver-stage.local.json`, secrets, URLs, Google folder IDs, or audio filenames to chat. Leave `.dev.vars` and `.dev.vars.live-backup` untouched. This public staging Web App must retain its separate strong secret and one-story allowlist; archive the staging deployment after testing is complete.
