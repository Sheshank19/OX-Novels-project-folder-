OX B9.2 — MAIN WEBSITE /api/internal/player-library route patch
2026-10-18

CONFIRMED SOURCE: Cloudflare main oxnovels.top Worker JavaScript pasted by the user.
SOURCE SHA-256 (bytes normalized to UTF-8 and LF): d77f182a159fe36c9a6be91bd7d9cbb4fb72aad7be80d1fbd34d4c9700fb9ac0

EDIT EXISTING PRODUCTION SOURCE ONLY (in Cloudflare Dashboard > main oxnovels.top Worker > Edit code):
1. Create/keep a backup of the current deployed Worker code and confirm Dodo code and DB/ASSETS bindings exist.
2. Search for the UNIQUE line:     const { pathname } = url;
   It appears directly inside var index_default = { async fetch(request, env) {...}.
3. Paste the complete contents of B92-INTERNAL-PLAYER-LIBRARY-INSERT.js IMMEDIATELY AFTER THAT LINE.
4. Do not change other code, website DB or Dodo bindings. Do not set new secrets yet.
5. Review the diff. Only the new /api/internal/player-library route should be added.
6. Deploy the updated website Worker as a deliberate website release (it affects production).
7. Check: curl.exe -i "https://oxnovels.top/api/internal/player-library"
   Before adding OX_PLAYER_SYNC_KEY, expected: HTTP 401 with {"error":"Unauthorized"}.
8. Also verify website login / home / Dodo pages still behave normally.
9. Only AFTER HTTP 401 verification, configure identical OX_PLAYER_SYNC_KEY secrets on the main site and Player Workers using their respective accounts; do not paste key into chat, code, or local files.

A full patched production Worker bundle is included for comparison ONLY.
It differs from the supplied original only by the route snippet and passed local
synthetic request tests. It was NOT deployed. Do not blindly overwrite a newer
production Worker with the bundled full file.

No payment, webhook, story purchase, user authentication or Drive-scanner routes were changed.
