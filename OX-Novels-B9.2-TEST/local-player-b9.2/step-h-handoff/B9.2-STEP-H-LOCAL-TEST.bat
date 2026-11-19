@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - STEP H / LOCAL SEALED CATALOG HANDOFF CONTRACT
 echo Uses synthetic changed-story fixtures only. No Drive or Cloudflare calls.
node --no-warnings --test ".\tests\step-h.test.mjs"
if errorlevel 1 (
  echo STEP H LOCAL TESTS FAILED - NO DEPLOYMENT.
  pause
  exit /b 1
)
echo STEP H LOCAL TESTS PASSED - NOTHING DEPLOYED.
pause
