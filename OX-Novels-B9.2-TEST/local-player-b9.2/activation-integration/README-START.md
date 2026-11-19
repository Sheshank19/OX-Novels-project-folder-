# OX B9.2 — local integration repair (no manager overwrite)

This replaces the earlier over-strict SHA-256 installer after it stopped at:
`B9.2 manager differs from the reviewed version`.

1. Extract into your `OX-Novels-B9.2-TEST` directory. Overwrite the **activation-integration installer files** when prompted, not the existing manager.
2. Run `local-player-b9.2\activation-integration\B9.2-INTEGRATE-PLAYER-LOCAL.bat`.
3. **Do not deploy**. The automatic paginated Drive synchronization and atomic activation are not integrated yet.

The revised installer preserves `local-player-b5/src/b9-catalog-manager.js` byte for byte (whatever local changes it contains), backs up existing worker entrypoints, and adds an isolated adapter + generation policy.

The adapter permits current and bounded previous catalog generations after existing Player session and encrypted track validation. It blocks the legacy one-pass scanner at all Worker entrypoints so it cannot publish incomplete Drive results, even if the local manager differs from the earlier reviewed copy. There are no network calls, secret changes or extra Cloudflare resources.

If an entrypoint or an existing generation-policy file has changed incompatibly, the installer **stops** instead of overwriting unknown user edits.
