@echo off
setlocal
cd /d "%~dp0\..\.."
echo OX B9.2 - STEP E / OFFLINE CHANGED-CATALOG QUARANTINE TESTS
echo No Google or Cloudflare network requests, no publishing.
echo.
node --no-warnings --test local-player-b9.2\step-e-quarantine\tests\step-e.test.mjs
if errorlevel 1 (
 echo STEP E LOCAL TESTS FAILED. Do not run real scan.
) else (
 echo STEP E OFFLINE TESTS PASSED. No real catalog changed.
)
pause
endlocal
