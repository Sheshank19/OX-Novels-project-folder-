# OX B9.2 — Durable catalog control-plane integration

This package is based on the uploaded current 2026-10-18 TEST folder, **not an older assumed B9.2 manager hash**. It preserves the existing `b9-catalog-manager.js` exactly.

## Actual change

- Adds a bound-only `B92_POINTER_DB` D1 read path to the existing Player generation adapter. If no D1 binding is configured, playback remains on its existing static and previously prepared compatibility paths.
- Adds verified one-object immutable KV storage for a changed encrypted story catalog (instead of many 24 KiB chunks); integrity checked with SHA-256.
- Adds atomic D1 revision-CAS catalog promotion and rollback library functions with an eight-hour previous-generation window. A 120-second minimum global-propagation margin is imposed before a stored candidate can be promoted; this margin is not a guarantee of KV global consistency.
- Adds dedicated D1 schema (create in a **dedicated database**, never OX main D1).
- Existing Worker stream handler, catalog index and admin/session authentication remain untouched.

## Safety

**No new routes, cron, deployments, secrets, paid services, D1 bindings, or automatic publication are installed.** The promotion library is deliberately unreachable from Worker HTTP events and requires positive independently validated publication proof. Step E/H receipts explicitly say `pinnedSnapshotProven:false`, `publicationAllowed:false`, and therefore cannot be activated. These checks must not be bypassed. Source-check test fixtures with positive proof do not substitute for a real Drive snapshot.

## Install (only when you're ready to merge the local source)

Unzip at `C:\Users\dundi\OX-Novels-B9.2-TEST`, preserving folder structure, then run `local-player-b9.2\release-integration\B9.2-PREPARE-LIVE-STORE-LOCAL.bat`. The installer verifies the uploaded adapter and generation-policy originals by SHA-256, preserves all other files, and writes timestamped backups. It can run a second time safely. **Never deploy this package alone**: the scanner and trusted publication proof source still require integration.

## Remaining required work for live automatic updating

1. Provide the 242-story resolver with per-story signed authorization and durable pagination; the current staged Apps Script permits only the one test story.
2. Bind production-safe KV and dedicated D1 to Player Account B, integrate a bounded cron/job cursor, and update the OX admin status to use D1.
3. Establish independent change-consistency evidence strong enough to authorize publication, connect it to these gated storage functions, then perform one real changed-story staging playback/rollback test before a controlled production rollout.

**Do not paste or share secrets, Drive IDs, private catalogs, `.dev.vars` or the handoff key.** They are not included here.
