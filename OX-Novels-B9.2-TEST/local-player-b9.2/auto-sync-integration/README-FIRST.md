# OX B9.2 — Multi-story durable audit integrated with existing Player (local source only)

**Purpose:** remove the one-test-story limitation and implement an actual resumable, Free-tier-conscious, paginated metadata audit *inside the existing B5 Player Worker code*. This intentionally does **not** update any currently published catalog. That missing link requires independently authenticated stable-source evidence, catalog preparation, staging/promotion, and measured CPU. Do not mistake a completed audit for an atomic Drive snapshot.

## Source changes and safety

- `B9.2-PREPARE-MULTI-STORY-AUDIT-LOCAL.bat`: installs two new Worker modules and inserts only one cron import, one cron callback and an authenticated aggregate admin status action into `b92-generation-adapter.js`.
- Existing `b9-catalog-manager.js` is never overwritten. Its old one-pass scanning/publication code remains disabled by `b92-generation-adapter.js`.
- No changes to MP3/M4A streaming, handoff keys, encryption, auth, or `oxnovels.top`.
- Re-running installer is idempotent, and installation makes a local backup. No remote commands, secret reads or deployments.
- `apps-script/OX-B92-MULTI-ROOT-RESOLVER.gs` is a replacement for a **separate staging Apps Script** project, NEVER paste into the existing live resolver. Existing one-story staging deployment is unaffected until deliberately updated. The v2 script must be deployed separately; installing the local Worker module does not alter Apps Script.
- `sql/0002_b92_resumable_readonly_audit.sql` is an *additive migration*, intended only for a private pointer D1 already provisioned with `0001_b92_live_catalogs.sql`. Never apply it to the site's main D1 or the synthetic Step C database.

## Later integration (NOT done automatically by installer)

Before scheduling any Cloudflare runs, the existing Player Worker must have a private `B92_POINTER_DB` binding, the two migrations applied to it, and a **separate** Apps Script deployment of the v2 resolver with script property `OX_STAGE_RESOLVER_SECRET` set to a new 32+ character secret. The Worker needs `B92_AUDIT_RESOLVER_URL`, private `B92_AUDIT_RESOLVER_SECRET` and `B92_AUDIT_MODE=readonly`. A `* * * * *` Worker cron schedule is needed to advance the audit. Never share these values in chat or include them in ZIPs.

The Worker reads its story/Drive-root roster from the existing OX internal library endpoint using `OX_PLAYER_SYNC_KEY`; visitor-supplied story IDs or folder IDs are never accepted. The v2 resolver validates the caller's secret, root-story binding, signed pagination cursor, and bounded nested-folder scope. This API still runs as its script owner, so its secret and deployment URL must remain private. Script-side metadata is **not** a pinned snapshot.

At most five pages are requested per scheduler tick. Checkpoints, signed cursors and read-only page evidence are stored privately in D1. The scanner handles Pacific-day cycles, daily roster changes when a new cycle begins, expired cursors, retries (at most 15), and failures while retaining the old published catalog. No Queues or KV writes are used for auditing. An authenticated Player Admin POST `action:"audit-status"` returns aggregate counts only, not raw Drive data.

## Reality check for Cloudflare Free

Earlier local estimates suggested roughly **4,978 pages for 242 stories** on a single complete pass, before retries or repeated changed-story observations. At most 5 pages/minute provides 7,200 theoretical page opportunities/day; this is not a throughput guarantee. Apps Script wall time, Drive throttling, D1 query/write counts, website Worker traffic, and per-invocation CPU must be observed on staging before deployment. If daily full scanning exceeds the available limits, the design must prioritize changed stories while spreading full verification across multiple days, or reduce metadata requests via a trusted change feed. Do not silently exceed the Free allowances or promise nightly completion before measuring.

**Not yet implemented:** change-feed consistency certificate, replay-safe encrypted catalog construction from D1 evidence, trusted sealed publication proof, staging promotion, production rollout. This integration contributes the real multi-story durable *audit* rather than another synthetic Worker, and cannot publish unverified data.
