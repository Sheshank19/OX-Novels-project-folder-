OX B9.2 -- FIRST REAL INTEGRATION CHECK (READ ONLY)

This is NOT another local/mock regression test. It queries your existing deployed
Google Apps Script resolver once for a SINGLE story folder.

1) Extract this ZIP into C:\Users\dundi\OX-Novels-B9.2-TEST only.
2) Leave your real OX-Novels folder, .dev.vars, and all secrets unchanged.
3) Your TEST project must already contain its normal local D1 copy and
   local-audio-lab\config\resolver.local.json. Never send these files in chat.
4) Double-click local-player-b9.2\B9.2-LIVE-READ-ONLY.bat.
5) Share only a screenshot or copy of the sanitized console summary.

The script makes one GET status request and one POST list_children read.
It uses your existing local resolver URL and secret IN MEMORY (does not
print, update or upload them). No files are uploaded to ChatGPT.
It never creates resources, writes to Cloudflare, changes Apps Script,
changes Drive, scans all stories, or publishes a catalog.

IMPORTANT SOURCE VALIDATION:
The original archived LAB script is OX-Audio-Resolver-LAB.gs and uses
'list_children' with a limit of 300 folders and 700 audio tracks per request.
The exact CODE OF THE DEPLOYED VERSION is not known from a local file.

To inspect the LIVE DEPLOYED source without changing it:
- Open your Google Apps Script project that owns the existing resolver.
- Click Deploy > Manage deployments; select the current web app.
- Note its VERSION NUMBER (do not share the URL or deployment ID).
- Open Project history, select that same immutable version, and inspect
  its code. Current editor code is not necessarily the deployed code.
- If you want to supply the source, make a local copy of the deployed
  version's .gs source, REMOVE secret values and private endpoints, and
  upload only the redacted .gs file. Do not deploy it or share OAuth tokens.

This check proves only that a single legacy resolver request works. It
cannot verify snapshot consistency, access to all 242 stories, Google
Drive Changes API permissions, or Cloudflare Free CPU budget.
