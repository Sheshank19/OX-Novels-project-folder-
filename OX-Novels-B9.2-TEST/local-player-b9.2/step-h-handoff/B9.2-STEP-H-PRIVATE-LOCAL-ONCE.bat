@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - STEP H / PRIVATE REAL CHANGED CATALOG HANDOFF - LOCAL ONLY
 echo No Drive, Cloudflare or Apps Script requests. No upload or publication.
node --no-warnings ".\scripts\prepare-step-h-local.mjs"
if errorlevel 1 (
  echo PRIVATE HANDOFF BLOCKED.
  pause
  exit /b 1
)
pause
