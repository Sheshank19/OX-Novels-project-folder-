@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - STEP F / SYNTHETIC CATALOG READ GATE - LOCAL ONLY
echo No Google Drive reads, Cloudflare requests, secret changes, deployments or publication.
echo.
node --no-warnings --test ".\tests\step-c.test.mjs" ".\tests\step-d-signal.test.mjs" ".\tests\step-f-catalog-preview.test.mjs" "..\step-d-bridge\tests\bridge-core.test.mjs"
if errorlevel 1 (
  echo.
  echo STEP F LOCAL TESTS FAILED. STOP - DO NOT DEPLOY.
  pause
  exit /b 1
)
echo.
echo STEP F LOCAL TESTS PASSED - NO DEPLOYMENT PERFORMED.
pause
