# OX B9.2 — verify real completed D1 canary (read-only)

This package performs one necessary integrity gate on the *existing* completed 534-track story audit before catalog updates can be considered. It does not re-run Drive scanning or create any resource.

Run `B9.2-VERIFY-COMPLETED-CANARY.bat` once. The BAT uses Wrangler's `d1 execute --remote --json` SELECT with a pipe to Node, so private Drive metadata remains only in process memory and is NOT printed or saved. It checks signed protocol flags, page SHA-256, ordering/completion, duplicate folders/tracks, tree completeness, checkpoint counts and a count/source-version comparison to the existing local protected static catalog (counts matching does not establish content equality). No `.dev.vars`, secrets or payment files are read or modified. Node never logs source IDs, tokens or file names.

**Important:** This is structural integrity of a non-atomic Drive observation. It does not prove that Drive was unchanged while pages were read, so the result **cannot authorize catalog publication or automatic updates**. Further independent consistency/change-window evidence and safe KV/D1 promotion are required. Do not use this as an automatic-release toggle.

If Wrangler returns an error, no changes have occurred. Contact developer with only the sanitized final RESULT or STOP line; never share raw D1 JSON.
