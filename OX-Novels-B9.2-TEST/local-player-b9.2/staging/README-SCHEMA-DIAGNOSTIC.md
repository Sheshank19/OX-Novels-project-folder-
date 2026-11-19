# OX B9.2 — one-story page-schema diagnostic (read-only)

The latest staging inventory returned **HTTP 200** but the local parser rejected one
page as `INVALID_STAGE_PAGE`. The prior reader grouped many separate checks
under that one error. This patch only adds a privacy-safe `Page schema rule`
line identifying the exact rejected field or flag. It does **not** relax the
validation, retry malformed pages, publish anything or modify your Apps Script.

## Installation

1. Make a backup of your `C:\Users\dundi\OX-Novels-B9.2-TEST` folder.
2. Extract the ZIP into this **test** folder with paths preserved.
3. Replace only `local-player-b9.2\staging\scan-one-story-readonly.mjs`.
4. Keep `resolver-stage.local.json`, the Apps Script and the main OX project unchanged.
5. Run `local-player-b9.2\staging\B9.2-ONE-STORY-READONLY.bat` **once**.
6. Share the sanitized console output. Do not share configuration JSON, URLs,
   raw Drive IDs, file names or the resolver secret.

If the test fails with `INVALID_STAGE_PAGE`, the report will additionally show
`Page schema rule: ...`. Do not publish catalogs after any incomplete run.

## Scope and safety

* Uses the same GET and read-only POST requests as the previous test.
* No Cloudflare requests and no Drive writes.
* Keeps the existing failure behavior: incomplete scans do not write the baseline.
* Reports only fixed validation labels, never rejected field values.
* No change to the previously deployed Google Apps Script.
