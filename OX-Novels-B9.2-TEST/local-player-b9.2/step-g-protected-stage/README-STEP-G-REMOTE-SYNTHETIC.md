# Step G -- first synthetic-only Cloudflare KV check

This patch adds a targeted Node.js client and an optional BAT wrapper. It **does not** modify the Worker, Wrangler config, `.dev.vars`, private catalogs or real baseline.

- Hard-coded destination: the dedicated `ox-b92-step-g-protected-vault-stage` Worker, not production or Step C.
- Uses **fabricated, in-memory** test bytes only (two chunks; no local catalog reads, Drive IDs, episode metadata, AES/HMAC secrets, or customer content).
- Authenticates with `B92_STEP_G_TOKEN` in the current PowerShell process environment.
- Validates the health flags before writing synthetic content.
- Tests manifest PUT, chunk PUT, read-back, SHA-256 reconstruction, and tampered-chunk rejection.
- Does not activate or publish any catalog, call Drive, modify D1 or schedule syncing. It adds three synthetic KV keys and performs read operations. This is within normal Free-usage volumes, but doesn't prove peak CPU or global KV visibility.

From the current PowerShell session in the `step-g-protected-stage` folder, **only if `$stepGToken` still holds the installed secret**:

```powershell
$env:B92_STEP_G_TOKEN = $stepGToken
node .\scripts\remote-synthetic-vault-once.mjs
Remove-Item Env:B92_STEP_G_TOKEN -ErrorAction SilentlyContinue
Remove-Variable stepGToken,bytes -ErrorAction SilentlyContinue
```

If the shell no longer holds the secret, **do not run with an empty token**. Rotate *only* `PROTECTED_STAGE_ADMIN_TOKEN` in this Worker in the usual way or ask for safe assistance.

The script should display `STEP G SYNTHETIC REMOTE QUARANTINE PASSED`. If it fails, do not immediately retry: writes may already have been committed. Report just the sanitized status lines, never credentials.

Do **not** upload the private 534-track catalog or its JSON. A Step E sealed change receipt is missing, and the Worker still has no catalog activation API.
