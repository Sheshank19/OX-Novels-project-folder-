# OX Novels - read-only retrieval of current public assets and local V3 merge.
# NO Cloudflare authentication, NO deploy, NO payment calls, NO D1 writes.
$ErrorActionPreference = 'Stop'
$root = 'C:\Users\dundi\OX-Novels-B9.2-TEST'
$v3 = Join-Path $root 'OX-DODO-LIVE-FRONTEND-REVIEW-V3'
$stage = Join-Path $root 'OX-DODO-V3-CURRENT-LIVE-ASSET-SNAPSHOT'
$public = Join-Path $stage 'public'
$outZip = Join-Path $root 'OX-DODO-V3-CURRENT-LIVE-ASSET-SNAPSHOT.zip'

if (-not (Test-Path (Join-Path $v3 'CANDIDATE-REVIEW\app.js'))) {
  throw 'V3 package not found. Extract OX-DODO-LIVE-FRONTEND-REVIEW-V3 into OX-Novels-B9.2-TEST first.'
}
if (Test-Path $stage) {
  throw "Snapshot folder already exists: $stage . Rename or move it before running this script again."
}
New-Item -ItemType Directory -Path $public -Force | Out-Null
$knownFiles = @(
  '49.html', 'admin.html', 'app.js',
  'assets/admin.css', 'assets/admin.js', 'assets/app-before-telegram-startup-sync.js',
  'assets/app.js', 'assets/legal.css', 'assets/lifetime.css',
  'assets/lifetime.js', 'assets/styles.css', 'contact.html',
  'index.html', 'privacy.html', 'raptor-migrate.html',
  'refund-policy.html', 'style.css', 'terms.html'
)
foreach ($rel in $knownFiles) {
  $remote = switch ($rel) {
    'index.html' { 'https://oxnovels.top/' }
    '49.html' { 'https://oxnovels.top/49' }
    default { 'https://oxnovels.top/' + $rel }
  }
  $dest = Join-Path $public ($rel.Replace('/', [IO.Path]::DirectorySeparatorChar))
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  try {
    Invoke-WebRequest -Uri $remote -OutFile $dest -ErrorAction Stop
    $bytes = (Get-Item $dest).Length
    if ($bytes -lt 20) { throw "Unexpectedly short response ($bytes bytes)" }
    Write-Host ('PASS: {0} ({1} bytes)' -f $rel, $bytes)
  } catch {
    Write-Host ('FAILED: {0} -> {1}' -f $rel, $_.Exception.Message)
    throw 'STOP: No deployment. Share the error output with ChatGPT.'
  }
}

# Verify the three approved V3 baseline files still exactly match production.
$approved = @('index.html', '49.html', 'assets/app.js')
foreach ($rel in $approved) {
  $name = Split-Path $rel -Leaf
  $live = Join-Path $public ($rel.Replace('/', [IO.Path]::DirectorySeparatorChar))
  $approvedOriginal = Join-Path (Join-Path $v3 'ORIGINAL-LIVE') $name
  if (-not (Test-Path $approvedOriginal)) { throw "Missing original V3 file: $approvedOriginal" }
  $currentHash = (Get-FileHash -Path $live -Algorithm SHA256).Hash
  $originalHash = (Get-FileHash -Path $approvedOriginal -Algorithm SHA256).Hash
  if ($currentHash -ne $originalHash) {
    throw "STOP: Live $rel changed since V3 review. Do not copy the V3 candidate; upload this snapshot for a new comparison."
  }
  Write-Host "MATCH: V3 original matches current live $rel"
}

# Keep the unmodified baseline separately, before local candidate replacement.
$baseline = Join-Path $stage 'ORIGINAL-THREE'
New-Item -ItemType Directory -Force -Path $baseline | Out-Null
foreach ($rel in $approved) {
  $name = Split-Path $rel -Leaf
  Copy-Item (Join-Path $public ($rel.Replace('/', [IO.Path]::DirectorySeparatorChar))) (Join-Path $baseline $name)
}

# Apply V3 only to these three verified files in the LOCAL snapshot.
foreach ($rel in $approved) {
  $name = Split-Path $rel -Leaf
  Copy-Item (Join-Path (Join-Path $v3 'CANDIDATE-REVIEW') $name) (Join-Path $public ($rel.Replace('/', [IO.Path]::DirectorySeparatorChar))) -Force
}
node.exe --check (Join-Path $public 'assets\app.js')
if ($LASTEXITCODE -ne 0) { throw 'STOP: Candidate app.js syntax failed. No deployment.' }

# A SHA256 inventory for follow-up review; safe public assets only.
$manifest = foreach ($file in Get-ChildItem $public -File -Recurse) {
  [pscustomobject]@{
    path = $file.FullName.Substring($public.Length + 1).Replace('\','/')
    bytes = $file.Length
    sha256 = (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}
$manifest | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $stage 'FILE-INVENTORY.json') -Encoding UTF8
@'
LOCAL FRONTEND REVIEW SNAPSHOT ONLY — NOT A DEPLOYMENT PACKAGE.
- public/: 18 known files fetched afresh from oxnovels.top, with exactly 3 V3 candidate replacements.
- ORIGINAL-THREE/: unmodified originals of index.html, 49.html, assets/app.js.
- FILE-INVENTORY.json: checksums.
Cloudflare may have other live assets not present in this known-file list. Before deployment the full actual asset inventory, Worker settings and credentials must be verified.
Do not deploy this folder to Cloudflare yet.
'@ | Set-Content (Join-Path $stage 'README-REVIEW-ONLY.txt') -Encoding UTF8
if (Test-Path $outZip) { throw "Output ZIP already exists: $outZip . Rename it and rerun after moving the snapshot folder." }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $outZip -CompressionLevel Optimal
Write-Host ''
Write-Host 'PASS: 18 known live asset files fetched, V3 originals matched, 3 local changes merged, JS syntax passed.'
Write-Host "NO DEPLOYMENT WAS MADE. Upload this ZIP: $outZip"
