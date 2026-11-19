# OX Novels B9.2 — Next safe action: 242-story READ-ONLY audit

**Proven milestone:** The `a-dragon-s-revenge` protected Player handoff, guest rejection, seven folders and actual audio playback work in production. DO NOT touch main `oxnovels.top` Worker, its Dodo code or `OX_HANDOFF_KEY`.

## 1. On your Windows PowerShell

Extract this package anywhere; keep your existing TEST folder unchanged. Run:

```powershell
node.exe "C:\Users\dundi\OX-Novels-B9.2-TEST\OX-B92-ALL-STORY-AUDIT-NEXT\VERIFY-242-AUDIT-READINESS.mjs"
```

This strictly checks the **2026-10-20 local source snapshot**, expected B9 manager SHA, cron, B92_AUDIT_DB binding, 242 index entries and track total. It reads no `.env`/`.dev.vars` values, performs **no web request**, never writes or deploys. If any source hash differs, STOP and inspect newer files; do not deploy old code.

## 2. Scope change (optional, only after checking existing Player free-account usage)

- Cloudflare dashboard: select **SEPARATE Player account B**, `Workers & Pages` -> Worker **listen** -> **Settings** -> **Variables and Secrets**.
- Save the current environment variable name/value `B92_AUDIT_CANARY_STORY=a-dragon-s-revenge` in a local note (not as a secret). **Delete ONLY this one plain variable**. Its absence means the existing `fetchTrustedRoster` returns all 242 authorized stories rather than filtering the canary. Do **not** touch encrypted secrets.
- Verify `B92_AUDIT_MODE=readonly`, the existing `B92_AUDIT_DB` binding and the cron `*/5 * * * *` remain unchanged.
- This variable-only change causes a new deployed configuration but should retain the existing code bundle; it is preferable to deploying a possibly stale source tree with Wrangler.

**Immediate emergency pause**: in the separate Player account change `B92_AUDIT_MODE` from `readonly` to `disabled`. The existing scheduled handler then exits without scanning; playback remains unchanged. Do not change `OX_HANDOFF_KEY`. To resume, restore `B92_AUDIT_MODE=readonly`.

**Important rollback limitation:** restoring `B92_AUDIT_CANARY_STORY=a-dragon-s-revenge` alone does **not** stop an already-seeded 242-story D1 cycle. The scheduler resumes unfinished D1 cycles before starting a new one. Restoring the canary affects only the next cycle's roster; to immediately stop the full scan use `B92_AUDIT_MODE=disabled`. Do not manually change D1 records. Evidence remains stored; no cleanup is performed.

## 3. Confirm one bounded check; no full Drive audit replay

After a Pacific-day cycle starts, use existing password-protected Player Admin audit status action `audit-status` and check `roster:242` and progress/status counts. If the previous one-story cycle is still `RUNNING`, the existing code first finishes that cycle and begins the 242-story cycle on the next Pacific date; do not edit production D1 to force it. There is no requirement to trigger repeated manual scans. In the original code `seedCycle` inserts 32 jobs per cron while the roster is being seeded (about eight ticks for 242), then begins page scanning. A started one-story cycle remains one-story; removing the variable is not a way to edit a historical cycle. Do not change D1 rows by hand.

**Safety notice:** This is an **inventory-only expansion**, not automatic catalog updates. The paginated Apps Script resolver explicitly reports no pinned snapshot. The current catalog stage/promotion code rejects unverified receipts. Do NOT lift the flags or bind a catalog pointer to bypass them. No additional Cloudflare resources, KV bindings, database migrations, external Drive scanners or automatic catalog changes are part of this step.

## Capacity and retention warnings

At the existing 5-minute schedule and five pages per tick there are only 1,440 logical page slots per day, before retries and failures. The 242 existing static catalogs already require an optimistic **3,985 pages** due to the 40-audio/page resolver limit; full coverage cannot finish in 24 hours with these settings. Plan around several days at the current pace. Google Apps Script runtime/quota and normal Player Worker usage remain unmeasured.

Cloudflare D1 Free has a **500 MB per-database size limit** and daily row quotas. This source retains all past audit pages; automatic pruning is **not implemented**. Do not leave perpetual full-library scans unattended for long periods. Check D1 storage and Player metrics before scaling or changing the cron. Do not upgrade to Paid. When a Free limit is exceeded, database operations will fail rather than safely promote new catalogs.

Next engineering task: build compact retained audit evidence and safe per-day quota caps, then independently verified changed-catalog publication with a reliable Drive revision boundary and D1 pointer rollback. The static Player remains authoritative until those safeguards work. Do not promise a zero-charge 100-listener guarantee without measured usage.
