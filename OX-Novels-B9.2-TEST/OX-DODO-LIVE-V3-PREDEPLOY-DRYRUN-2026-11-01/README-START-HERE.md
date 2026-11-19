# OX Novels – main Worker + matched V3 assets (DRY RUN FIRST)

**NOT YET DEPLOYED. Checkout still disabled.** This package was built from the user's November 1 public asset snapshot and the staged full V2 Worker which the user previously deployed and tested (503 when checkout flag absent, 200 official signed webhook example). It includes NO secret values and NO .dev.vars.

## Verified offline
- 18 public files; exact same names as the original main-site project public directory (not the separate Player project). This is strong but NOT exhaustive evidence of current remote asset inventory.
- Original LIVE HTML/JS baselines match V3 reviewed originals byte-for-byte.
- Only /index.html, /49.html, /assets/app.js are changed from live; the remaining 15 files are byte-for-byte downloaded live.
- All included JavaScript syntax checks pass.
- Existing wrangler.jsonc restored from the earlier main project, with the same `name: ox-novels`, DB database id, compatibility date, `ASSETS` binding, and `/api/*` run_worker_first. Review this against current Cloudflare settings before deployment; never invent bindings or change database IDs.

## Windows local preflight (read only / no deployment)
1. Extract this archive to C:\Users\dundi\OX-Novels-B9.2-TEST\OX-DODO-LIVE-V3-PREDEPLOY-DRYRUN-2026-11-01
2. Open PowerShell, run:

   $r = 'C:\Users\dundi\OX-Novels-B9.2-TEST\OX-DODO-LIVE-V3-PREDEPLOY-DRYRUN-2026-11-01'
   Set-Location $r
   .\VERIFY-PACKAGE.ps1
   npx.cmd wrangler deploy --dry-run --outdir .\_dryrun_output

`--dry-run` does NOT deploy. `npx.cmd` is for Windows PowerShell. If a login/account prompt or error occurs, do not share tokens or secrets; share only sanitized output.

## Hold before real deployment
Do NOT run `wrangler deploy` until the correct Cloudflare account, matching main Worker config, all current production assets, current main Worker source, and a small live Dodo checkout/fulfillment smoke test path are confirmed.

**Checkout flag** `OX_ENABLE_DODO_LIVE` remains unset. Deploying this V3 frontend NOW would route new paid purchases to a 503, interrupting new purchases. Coordinate flipping checkout enable and frontend rollout together. Existing PayPal subscriptions must keep working.

When ready to deploy, Cloudflare Wrangler has a `--keep-vars` flag to preserve plaintext dashboard-set vars, while existing encrypted secrets are always preserved; but check bindings, routes, and asset counts against the real deployed Worker first.

Rollback: Use prior Cloudflare deployment to restore code/assets only, do not restore D1 after real payments. Stop new checkouts by removing the enable flag while keeping Live webhook processing active.
