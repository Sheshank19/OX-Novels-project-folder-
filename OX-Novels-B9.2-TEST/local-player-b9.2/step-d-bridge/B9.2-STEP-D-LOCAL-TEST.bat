@echo off
setlocal
cd /d "%~dp0\..\.."
echo OX B9.2 - STEP D / LOCAL INTEGRATION CONTRACT TESTS
echo NO DRIVE / CLOUDFLARE CALLS, NO DEPLOYMENTS OR PUBLICATION.
echo.
node --version
node --no-warnings --test local-player-b9.2\step-d-bridge\tests\*.test.mjs local-player-b9.2\step-c-cloudflare-stage\tests\step-c.test.mjs
if errorlevel 1 (
 echo STEP D LOCAL TEST FAILED - NO LIVE CHANGES.
) else (
 echo STEP D LOCAL CONTRACT PASSED - NO LIVE CHANGES.
)
pause
endlocal
