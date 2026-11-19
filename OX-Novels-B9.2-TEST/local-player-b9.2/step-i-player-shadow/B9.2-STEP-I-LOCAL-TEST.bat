@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - STEP I / PLAYER GENERATION SHADOW GATE - OFFLINE
 echo No Google Drive, Cloudflare, Apps Script, deployments, uploads or publication.
node --no-warnings --test tests\step-i.test.mjs
if errorlevel 1 (
  echo STEP I LOCAL TESTS FAILED. Production unchanged.
  pause
  exit /b 1
)
echo STEP I LOCAL SHADOW GATE PASSED - NO DEPLOYMENT.
pause
