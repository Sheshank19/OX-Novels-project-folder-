@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - STEP J / SQLITE-INDEXED PLAYER AUTHORIZATION TEST
 echo Offline SQLite + WebCrypto. NO Cloudflare, Google Drive, deployments or publication.
node --no-warnings --test "tests\step-j.test.mjs"
if errorlevel 1 (
  echo STEP J LOCAL SQLITE TESTS FAILED - NO DEPLOYMENT.
  pause
  exit /b 1
)
echo STEP J LOCAL SQLITE TESTS PASSED - NO DEPLOYMENT.
pause
