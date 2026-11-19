@echo off
setlocal
cd /d "%~dp0"
echo.
echo OX B9.2 - STEP C - SYNTHETIC ONLY WORKER / KV / D1 TESTS
node --version
node --test tests\step-c.test.mjs
if errorlevel 1 (
  echo.
  echo STEP C LOCAL TESTS FAILED - DO NOT DEPLOY.
) else (
  echo.
  echo STEP C LOCAL TESTS PASSED - NO CLOUDFLARE DEPLOYMENT.
)
pause
