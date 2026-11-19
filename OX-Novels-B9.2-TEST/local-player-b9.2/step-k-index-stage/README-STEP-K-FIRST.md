# OX B9.2 — Step K / ISOLATED D1 INDEX BENCHMARK

## Goal

Step J passed 14/14 offline SQLite tests. Step K moves **only that indexed lookup workload** to an isolated Cloudflare staging Worker + its own NEW D1 database. The purpose is to measure real indexed query behavior and per-invocation CPU before any Player integration.

This is **not** a new Player. No audio, live user authentication, real encrypted tracks, catalog uploads, catalog activation, queues, Drive scans, or scheduled jobs are implemented. The test tokens are fabricated strings with `t1`-shaped syntax; they are NOT genuine AES-GCM encrypted tokens. The Worker does not accept arbitrary caller-supplied tokens or story IDs.

**Do not edit `listen`, `oxnovels.top`, Step C, Step G, any 242 published catalogs, `.dev.vars`, or `.dev.vars.live-backup`.** The real private 534-track catalog remains local and must not be sent to Step K.

## Files, local test and what has already been verified

- `src/step-j-index-gate.mjs`: unmodified copy of the Step J read-only indexed gate (shared contract), used for SHA-256 membership digest and the exact parameterized D1 query.
- `src/synthetic-fixture.mjs`: deterministic synthetic-only tokens and story/generation identifiers.
- `src/worker.mjs`: staging-only `/health`, authenticated `/v1/status`, and POST `/v1/benchmark`. No write endpoints. All responses flag publication/playback disabled.
- `migrations/0001_index_shadow.sql`: creates the two indexed staging tables. APPLY ONLY TO THE NEW STEP K DATABASE.
- `scripts/generate-synthetic-seed.mjs`: local-only optional generator of **1,069 fabricated SHA-256 membership rows**. It does not connect to Cloudflare. It refuses to overwrite a prior file.
- `scripts/remote-synthetic-index-benchmark.mjs`: optional later remote read-only sample of 24 indexed D1 requests. **It does not print tokens.** The network latency it reports is NOT Cloudflare Worker CPU.
- `tests/step-k.test.mjs`: verifies actual in-memory SQLite primary-key lookup and the Worker route/authorization/failure contracts without network.
- `wrangler.example.toml`: separate resources; no production bindings.

Install: make a backup of `C:\Users\dundi\OX-Novels-B9.2-TEST`, extract the patch there preserving directory structure, then run:

`local-player-b9.2\step-k-index-stage\B9.2-STEP-K-LOCAL-TEST.bat`

Expected: **11 tests pass, 0 fail**. No Cloudflare requests or writes occur. This is the ONLY required action now.

## Planned remote staging: WAIT FOR EXPLICIT APPROVAL BEFORE RUNNING

Proposed resources in the **OX Audio Player** Cloudflare account B:

- New D1 database: `ox-b92-step-k-index-db` (separate from `ox-b92-step-c-synthetic-db`).
- New Worker: `ox-b92-step-k-index-stage`.
- Unique secret only for Step K: `STAGE_BENCH_TOKEN`.
- D1 binding: `INDEX_STAGE_DB`; Worker variable `STAGE_MODE="index-benchmark-only"`.
- No KV namespace, R2, Queue, custom domain, cron trigger, or production route.

After approval, verify the correct account with `npx.cmd wrangler whoami` and copy `wrangler.example.toml` to `wrangler.toml`, replacing only the new Step K D1 UUID. Verify the Worker name and binding before any mutation. **Never pass an existing production or Step C database UUID.**

Planned commands, **for later use only, not for this local test**:

```
npx.cmd wrangler d1 migrations list ox-b92-step-k-index-db --remote --config wrangler.toml
npx.cmd wrangler d1 migrations apply ox-b92-step-k-index-db --remote --config wrangler.toml
node .\scripts\generate-synthetic-seed.mjs
npx.cmd wrangler d1 execute ox-b92-step-k-index-db --remote --config wrangler.toml --file .\synthetic-seed.sql
npx.cmd wrangler deploy --config wrangler.toml
```

Stage secret must be generated separately from previous staging secrets, locally and entered privately using Wrangler; do NOT put it in the config or paste it in chat. Only run the remote read-only benchmark **once** after verifying the resource isolation, seeded count of 1,069, and the `/health` response.

A remote error is a STOP signal, not an invitation to automatically rerun migrations/seed scripts. The seed uses `INSERT OR IGNORE` so its own content is idempotent, but blindly rerunning a partial operation should still be avoided.

## Quotas and proof limitations

Seeding the two synthetic generations writes approximately **1,069 D1 membership rows plus one pointer row**, only once. This is a bounded staging workload, not a plan for backfilling the real 154,699 Player tracks in one day. That larger workload may exceed the D1 Free daily write allowance and must be paced or redesigned.

The sample has 24 protected staging requests and 24 D1 indexed membership reads, plus health/status. It does not include full Player session verification, AES-GCM decryption, Google Drive media fetches, browser playback, or actual user concurrency. It cannot prove Cloudflare CPU p95/p99 by local execution; inspect the new Worker-specific Cloudflare Metrics after a real deployment.

The fixed far-future grace expiry in the synthetic fixture is to make two generations testable independently of wall-clock time; it is NOT a safe production expiry policy. No previous-generation retention decision is made here.

The staged member store has *hash-only* token membership. This does not guarantee Drive snapshot consistency, global KV consistency, D1 consistency across all regions, safe Player integration, or automatic publication. Production activation remains blocked.
