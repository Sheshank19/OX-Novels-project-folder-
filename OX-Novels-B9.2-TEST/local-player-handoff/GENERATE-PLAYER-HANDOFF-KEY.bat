@echo off
setlocal
cd /d "%~dp0"
if exist .env.player-handoff (
  echo A Player handoff key already exists. It will NOT be replaced.
  powershell -NoProfile -Command "Get-Content -Raw '.env.player-handoff' ^| Set-Clipboard"
  echo Existing key copied to clipboard.
  echo Paste it into Cloudflare as the OX_HANDOFF_KEY Secret. Do not paste it into chat.
  pause
  exit /b 0
)
powershell -NoProfile -Command "$b=New-Object byte[] 32; $r=[System.Security.Cryptography.RandomNumberGenerator]::Create(); $r.GetBytes($b); $r.Dispose(); $s=[Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_'); [IO.File]::WriteAllText((Join-Path (Get-Location) '.env.player-handoff'),$s,(New-Object Text.UTF8Encoding($false))); Set-Clipboard $s"
if errorlevel 1 (
  echo Unable to generate the handoff key.
  pause
  exit /b 1
)
echo New 256-bit Player handoff key generated locally and copied to clipboard.
echo Paste it into Cloudflare as a Secret named OX_HANDOFF_KEY.
echo Do NOT paste the value into ChatGPT or screenshots.
pause
