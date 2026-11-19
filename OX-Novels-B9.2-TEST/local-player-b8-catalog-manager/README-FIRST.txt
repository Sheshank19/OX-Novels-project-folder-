OX PLAYER ACCOUNT B — PHASE B8.1
LOCAL PLAYER CATALOG MANAGER
=====================================

PURPOSE
-------
This is the first management layer after the successful 242-story rollout.

It does NOT modify production oxnovels.top.
It does NOT add a Cloudflare API token to the OX Worker.
It does NOT change .dev.vars, .dev.vars.live-backup, OX_HANDOFF_KEY, D1, Google Drive, or Player streaming code.

It uses the already-proven local-player-b6 + local-player-b5 catalog system.

INSTALL
-------
Move only:

  local-player-b8-catalog-manager

directly into:

  C:\Users\dundi\OX-Novels

Expected:

  C:\Users\dundi\OX-Novels\local-player-b5
  C:\Users\dundi\OX-Novels\local-player-b6
  C:\Users\dundi\OX-Novels\local-audio-lab
  C:\Users\dundi\OX-Novels\local-player-b8-catalog-manager

FIRST TEST
----------
1. Run VERIFY-B8.bat
2. Run START-B8-PLAYER-CATALOG-MANAGER.bat
3. Browser opens:
     http://127.0.0.1:8792

FEATURES
--------
- Current OX story count
- Published Player catalog count
- PUBLISHED_CURRENT
- PREPARED_NOT_PUBLISHED
- MISSING_CATALOG
- SOURCE_CHANGED
- NO_DRIVE_SOURCE
- ORPHANED_PUBLISHED
- Search/filter
- Prepare/Refresh one story
- Prepare all missing/source-changed stories
- Automatic retry: up to 3 attempts
- Retry backoff: 2 seconds, then 5 seconds
- Permanent failure history:
    local-player-b6\reports\b8-failure-history.jsonl
- Root Drive check for one story
- Safe orphan removal from LOCAL Player publication state
- Job progress/log panel
- Stop-after-current-story button

WHY AUTOMATIC RETRY
-------------------
The 242-story rollout proved that some Google Drive / Apps Script metadata requests
can fail temporarily and then succeed without any story change. B8 automatically
retries temporary failures instead of making you rerun the full batch manually.

PUBLICATION
-----------
B8.1 intentionally does not deploy to Cloudflare by itself.

After the dashboard shows the catalogs you want as prepared/current, run:

  C:\Users\dundi\OX-Novels\local-player-b6\BUILD-AND-DEPLOY-CURRENT-PLAYER.bat

This keeps Player-account deployment credentials out of the main OX website.

NEXT
----
After B8.1 is approved locally, the next stage can add a lightweight
"Player Catalogs" section/link inside the real OX Admin using the same status model,
without putting a broad Cloudflare credential into oxnovels.top.

B8.2 PRODUCTION SNAPSHOT WORKFLOW
--------------------------------
OX Admin > Player Catalogs can export PRODUCTION-STORY-SNAPSHOT.json.
To make B6/B8 use that exact production library, run:

  IMPORT-PRODUCTION-STORY-SNAPSHOT.bat

and paste/drag the downloaded JSON path when asked. B6/B8 will use the imported
production snapshot until local-player-b6\PRODUCTION-STORY-SNAPSHOT.json is removed.
