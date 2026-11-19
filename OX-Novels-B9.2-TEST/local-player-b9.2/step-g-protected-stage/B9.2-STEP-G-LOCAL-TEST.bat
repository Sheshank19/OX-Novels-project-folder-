@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - STEP G / PROTECTED STAGING QUARANTINE CONTRACT - OFFLINE
 echo Zero Drive, Cloudflare, Apps Script calls; zero upload or publication.
node --no-warnings --test "tests\step-g-vault.test.mjs" "tests\step-g-receipt.test.mjs"
if errorlevel 1 (
 echo STEP G LOCAL TESTS FAILED - NOTHING DEPLOYED.
) else (
 echo STEP G LOCAL TESTS PASSED - NOTHING DEPLOYED.
)
pause
