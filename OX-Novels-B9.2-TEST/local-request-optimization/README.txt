OX WEBSITE REQUEST OPTIMIZATION v1 — LOCALHOST ONLY

Purpose:
Reduce OX background Worker/D1 polling before the Audio Player is integrated.

Changes:
- /api/session safety polling: every 5 seconds -> every 10 minutes.
  Page load, focus, pageshow and visibility return still refresh immediately.
- /api/posts/status: every 10 seconds -> every 10 minutes.
- /api/posts while Posts is open: every 10 seconds -> every 60 seconds.
- Chat: when Chat is OPEN, messages refresh every 10 seconds.
  When Chat is CLOSED, /api/chat/status is network-fetched at most once per 10 minutes.
- Telegram repeated status cache: 30 seconds -> 5 minutes; focus/return force checks remain.
- Story cover URLs get a version query tied to story updated_at, enabling immutable browser caching.

This does NOT touch:
.dev.vars / .dev.vars.live-backup
payments
Telegram credentials/configuration
D1 migrations
production data
Audio Lab

Use LOCALHOST only.
Run APPLY-REQUEST-OPTIMIZATION.bat, restart normal OX localhost, then rerun Usage Test v2.
