# B9.2 roster fetch diagnostic — existing Player only

**Purpose:** the scheduled scan currently fails before accessing Google Drive with `OX_ROSTER_FETCH_FAILED`, which hides the underlying exception. This file changes only `src/b92-audit-scheduler.js`.

## Installation

1. Extract this archive into `C:\Users\dundi\OX-Novels-B9.2-TEST` (do not overwrite credentials).
2. Run `local-player-b9.2\roster-diagnostic\B9.2-APPLY-ROSTER-DIAGNOSTIC-LOCAL.bat`.
3. In PowerShell:

```powershell
cd "C:\Users\dundi\OX-Novels-B9.2-TEST\local-player-b5"
npx.cmd wrangler deploy --dry-run
```

Only if the dry run succeeds, deploy the `listen` Worker with `npx.cmd wrangler deploy`. Retain prior version for rollback. After deploying, capture **one** cron event via `npx.cmd wrangler tail listen --format pretty`; press Ctrl+C after the event. Copy the `[B92_ROSTER_FETCH_DIAGNOSTIC]` line and any accompanying error code (never secrets). No need to reapply D1 migrations or change secrets.

`redirect:'manual'` prevents credential forwarding during a redirect and reports HTTP 3xx distinctly. A 20-second AbortController timeout replaces the previous `AbortSignal.timeout` use. Logs sanitize URL strings, Bearer values and long opaque tokens. Publication remains disabled. The old scanner stays disabled. No new Worker, database or paid service.
