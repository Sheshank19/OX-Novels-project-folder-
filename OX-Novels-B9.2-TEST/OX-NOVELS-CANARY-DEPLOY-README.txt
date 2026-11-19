OX NOVELS — ONE STORY PLAYER CANARY
Prepared 2026-10-21 from user's uploaded LIVE-MAIN-WORKER-2026-10-21.mjs

INPUT SHA256 prefix  : fbaf20787f25fe70
OUTPUT SHA256 prefix : 1a3e7bfcec374ad0

No production deployment has been made by this package.
Never deploy older TEST src/index.js or PATCHED-OX-NOVELS-PRODUCTION-BUNDLE.mjs.

CHANGES (only three):
  1. Added the B9.2 protected handoff helper before var index_default.
  2. Added one GET /api/story/:id/player-launch route before /open.
  3. Adjusted the existing authorized /open return: only a-dragon-s-revenge
     returns /api/story/a-dragon-s-revenge/player-launch; other stories
     return their existing Google Drive URL.

BEFORE DEPLOYMENT
  - Confirm Cloudflare main Worker is ox-novels, custom domain oxnovels.top.
  - Confirm its active script is still the exact current export supplied to ChatGPT.
  - Confirm backups and previous deployment are available for rollback.
  - Confirm settings still list OX_HANDOFF_KEY (Secret), OX_PLAYER_SYNC_KEY
    (Secret), existing Dodo keys, ASSETS and DB -> ox-novels-db.

DASHBOARD PROCEDURE
  1. In the MAIN Cloudflare account: Workers & Pages > ox-novels > Edit code.
  2. Locate the existing index.js / code editor containing var index_default.
  3. Verify you are editing this single bundled main Worker file, not assets
     or the Player Worker. If your dashboard shows different source structure,
     stop and inspect rather than replacing anything.
  4. Paste the COMPLETE contents of OX-NOVELS-MAIN-WORKER-CANARY-2026-10-21.mjs
     into that same main Worker code editor, replacing its code text only.
  5. Inspect Cloudflare diff/preview (if available), then Save and Deploy.
     Do NOT change Worker secrets, D1 bindings, ASSETS bindings or assets.
  6. Confirm the main site's normal homepage loads, then run one controlled
     guest denial test and one authorized canary Play of an actual episode.
  7. Confirm a separate non-canary story still goes to Google Drive.

ROLLBACK
  If any functional regression occurs, use Workers & Pages > ox-novels >
  Deployments > prior known-good deployment > Rollback. Do not touch separate
  listen Worker or rotate OX_HANDOFF_KEY.

SCOPE OF VALIDATION
  - Syntax checked with node --check.
  - Compared source and diff (3 insertion/replacement points only).
  - Local mock: guest 401 LOGIN_REQUIRED, authorized form and encryption,
    noncanary 404 on launch, canary /open redirect, other /open Drive preserved.
  - This does not prove live Cloudflare secret matching or actual playback.
