# OX B9.2 — Step G: protected catalog quarantine staging path (LOCAL PREP ONLY)

**STOP: No permission to deploy or upload actual story data was granted by this package.**
This package contains new files only under `local-player-b9.2/step-g-protected-stage/`. It does NOT replace the deployed `ox-b92-step-c-synthetic-stage` Worker, D1, KV, production `listen` Worker, or website.

## What this milestone implements

- A separate, deployable-in-future **quarantine vault Worker** using its OWN KV namespace and its OWN stage-only admin secret. The Worker has NO activation, catalog-pointer, D1, Drive, streaming, scheduled-scan or publication routes.
- A byte-bounded protected catalog transport: <=24 KiB per catalog chunk, <=96 chunks per candidate, SHA-256-verified manifest and chunks. The manifest includes only counts, byte sizes and digests (not story names, Drive IDs, raw episode names or tokens).
- A local, read-only inspection command that (if a legitimate Step E quarantine pair exists) verifies the keyed Step E receipt against the saved HMAC baseline, verifies existing Player AES token compatibility, checks previous static catalog digest, and reconstructs an in-memory chunk manifest. **No network and no local file writes.**
- If no Step E pair exists, the inspect command may validate one existing private *PREPARED* catalog for format only. It remains **NOT eligible for upload** without Step E receipt. If neither exists, it reports no candidate. Do not create dummy customer content.
- Offline integration tests covering signed-receipt validation, chunk integrity, authentication, idempotence and tamper rejection.

## Install (does NOT deploy)

1. Make a backup of `C:\Users\dundi\OX-Novels-B9.2-TEST`.
2. Extract the ZIP into that TEST folder, preserving folder paths.
3. Run `local-player-b9.2\step-g-protected-stage\B9.2-STEP-G-LOCAL-TEST.bat` once. Expected: `15 tests / 15 pass / 0 fail`.
4. Optional: run `B9.2-STEP-G-INSPECT-PRIVATE-LOCAL.bat`. It verifies your local B9.2 private candidate if available **without opening a network connection**. It prints only counts and safety categories. It will not generate a changed catalog if Drive is unchanged.

**Do not:** copy `wrangler.example.toml` into any existing Worker, deploy this Worker, create KV resources, publish candidate JSON, upload private files, or share private `.json`, `.env`, Drive IDs, tokens, root folder URLs, staging login URLs or staging secrets. Do not modify `.dev.vars` / `.dev.vars.live-backup`.

## Exact limits and caveats

- Step E's `twoPassObserved` is evidence of two matching reads, **not an atomic Drive snapshot**. Its receipt always has `publicationAllowed:false`, `pinnedSnapshotProven:false`, and `requiresHumanReview:true`.
- The future Worker can check **byte hashes and sizes**, but it does **not** hold the Player AES key or the Step E resolver HMAC secret. It cannot itself authenticate the Step E provenance or decrypt protected `t1` tokens. The **local** gate must do this before any separate upload approval; even then, storage is NOT permission to publish.
- The protected catalog JSON encrypts Drive file IDs in tokens, but **folder names, episode names, MIME types and other catalog metadata remain readable in JSON**. This matters before asking for consent to store real catalog bytes in Cloudflare.
- Global KV propagation is eventually consistent. Local put/read-back does not prove worldwide visibility. No real Cloudflare Worker CPU, KV or D1 quota usage is measured in these tests.
- The worker has no public catalog read endpoint and no OX entitlement or live Player integration. No automatic sync of 242 stories. No new migration, KV or Worker deployments at this time.
- A later approved live rehearsal would require a **new** Worker and **new dedicated** KV in Account B, with a **new stage-only** admin secret. It MUST NEVER reuse the Step C staging resources or Player bindings. More durable storage/read consistency and Cloudflare Free CPU measurements would be needed before any real activation design.

## How the read-only local verification handles different states

| Local source | What it verifies | Upload eligible? |
| --- | --- | --- |
| Step E changed-catalog pair | Receipt HMAC + saved baseline, full protected token format, previous catalog digest, byte digest and chunk reconstruction | No automatic permission; explicit consent and separate safeguards required |
| Earlier B9.2 prepared candidate only (534-track story) | Local Player token shape, counts and byte size | **No**; no sealed changed-catalog proof |
| No private candidate | Prints a safe waiting state | No |

### What is next

With this local-only storage/reader contract tested, we can seek explicit permission to create a **dedicated Step G staging Worker and KV** (not production, and not the synthetic Step C Worker). A separate, later permission is needed before any real episode names/catalog tokens leave the PC. The existing production Player and all 242 catalog files remain unchanged.
