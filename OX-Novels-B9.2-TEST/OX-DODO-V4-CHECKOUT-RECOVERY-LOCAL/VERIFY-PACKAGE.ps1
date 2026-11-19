$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$files=Get-ChildItem (Join-Path $root 'public') -File -Recurse
if ($files.Count -ne 18) { throw "STOP: Expected 18 public assets; found $($files.Count)" }
$inventory=Get-Content (Join-Path $root 'ASSET-BASELINE-AND-CANDIDATE-SHA256.json') -Raw | ConvertFrom-Json
foreach ($item in $inventory) {
  $path=Join-Path (Join-Path $root 'public') ($item.path.Replace('/', [IO.Path]::DirectorySeparatorChar))
  if (-not (Test-Path $path)) { throw "STOP: Missing $($item.path)" }
  $sha=(Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($sha -ne $item.sha256) { throw "STOP: Unexpected content change in $($item.path)" }
}
if ((Test-Path (Join-Path $root '.dev.vars')) -or (Test-Path (Join-Path $root '.env'))) { throw 'STOP: Secrets unexpectedly located in release directory' }
node.exe --check (Join-Path $root 'src\index.js')
if ($LASTEXITCODE -ne 0) { throw 'STOP: Main Worker JS invalid' }
node.exe --check (Join-Path $root 'public\assets\app.js')
if ($LASTEXITCODE -ne 0) { throw 'STOP: Frontend JS invalid' }
$config=Get-Content (Join-Path $root 'wrangler.jsonc') -Raw
if ($config -notmatch '"name"\s*:\s*"ox-novels"' -or $config -notmatch '"binding"\s*:\s*"ASSETS"' -or $config -notmatch '"binding"\s*:\s*"DB"') {throw 'STOP: Wrong worker/bindings in config'}
Write-Host 'PASS: 18 assets, SHA256 manifest, Worker JS, frontend JS, and main Worker config.'
Write-Host 'NO DEPLOYMENT MADE. Next: npx.cmd wrangler deploy --dry-run --outdir .\_dryrun_output'
