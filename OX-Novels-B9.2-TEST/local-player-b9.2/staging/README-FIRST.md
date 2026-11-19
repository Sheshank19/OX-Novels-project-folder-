# OX B9.2 — REAL READ-ONLY STAGING (not another mock-test cycle)

## What we confirmed from the code you shared

The live service is `lab-v3` and supports authenticated `list_children` only. Its one-request listing is capped at 300 child folders and 700 audio tracks, and it does not offer pagination or pinned Drive snapshots. Your prior live read-only test confirmed real access to one root (6 folders, 0 audio at root). We are **not replacing it**.

## Purpose of this package

Create an **entirely separate** Apps Script web app, with a **new staging-only secret** and one allowlisted test-story root. Verify real Drive pagination for a root and one immediate subfolder. No Cloudflare, catalog updates, or writes to Drive. Do NOT paste the stage file into the existing live Apps Script project; do NOT update the deployment whose ID you shared.

## Step 1: Copy staging code into a NEW Apps Script project

1. Sign in as the Google account that can already read your audio story folder.
2. Visit https://script.google.com/home/projects and click **New project**. Name it `OX B9.2 Staging Read Only`.
3. Open `local-audio-lab/apps-script/OX-Audio-Resolver-B9.2-STAGING-READONLY.gs` from this package with Notepad.
4. Paste its entire contents into the **new project's** `Code.gs`. Save.
5. Do **not** alter your existing OX Audio Resolver `lab-v3` project.

## Step 2: Set NEW staging-only Script Properties

In the **new** Apps Script project: Project Settings > Script Properties > Add script property:

- `OX_STAGE_RESOLVER_SECRET` = a new unique random secret, at least 32 characters. From Windows PowerShell (local only): `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` . Copy the generated secret locally. Do not send it in ChatGPT.
- `OX_STAGE_TEST_ROOT_ID` = Drive folder ID of ONE test story (the part after `/folders/` in its Google Drive URL). Do not share the ID publicly.

The secret and root ID must NOT be entered into the `.gs` source. Stage source and production source do NOT share Script Properties because they are separate projects.

## Step 3: Create ONLY the staging Web App deployment

Use Deploy > New deployment > Web app; description: `B9.2 read-only staging`; execute as **Me** (the Drive-reading account). To allow the local Node script to send authenticated POST requests without a Google login flow, choose **Anyone** for Who has access, if your account permits it. Warning: the endpoint is publicly reachable in this mode; a strong staging-only secret and single-root allowlist are essential. Do NOT reuse the production resolver secret. Do NOT leave this endpoint enabled after testing; archive it in Manage deployments when finished.

Copy the **new staging** `/exec` URL locally. Authorize the requested Google Drive *read access* in the Apps Script authorization dialog. Review that you are in the NEW project before granting authorization.

## Step 4: Configure your existing Windows TEST folder locally

Inside `C:\Users\dundi\OX-Novels-B9.2-TEST\local-player-b9.2\staging\`:

1. Copy `resolver-stage.example.json` to `resolver-stage.local.json`.
2. Fill in `resolverUrl` with the NEW staging `/exec` URL.
3. Fill in `resolverSecret` with the NEW staging-only secret.
4. Fill in `testStoryDriveUrl` with the SAME test story root folder URL used in Script Properties.
5. **Do not upload `resolver-stage.local.json`** or share its contents. Do not modify `.dev.vars`, `.dev.vars.live-backup`, or `local-audio-lab/config/resolver.local.json`.

## Step 5: ONE real staging check, not another regression suite

Double-click: `local-player-b9.2/staging/B9.2-STAGING-READONLY.bat`

It requests the root and its first immediate subfolder, reading at most 25 pages per folder. Reports show only counts, elapsed milliseconds and status. The script does NOT write Drive content, update the 242 catalogs, or deploy Cloudflare.

Send the sanitized console output to ChatGPT. It should say `READ-ONLY STAGING PAGINATION SUCCEEDED`. A report with zero tracks in the chosen first child is not necessarily an error; a different test child may be needed.

## Key limitations and next real integration step

This uses Google `DriveApp` continuation tokens. These are pagination cursors, **not atomic snapshot guarantees**. The results must NOT activate KV catalogs. After this check, we will implement genuine end-to-end one-story catalog staging with change-window checks, Cloudflare CPU/quota measurement, and manual approval before touching production.

If your Google account does not permit an Anyone web app, do NOT weaken enterprise policies. We can use editor-run staging tests instead and adjust the probe; do not publish any code to your working production resolver.

## Files you must NOT share

- `resolver-stage.local.json`
- Existing production resolver.local.json
- Any private key, Drive URL or folder ID
- `.dev.vars` or `.dev.vars.live-backup`

The source file includes NO credentials, no hardcoded folder IDs, no write capabilities and no playback changes.
