@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - STEP K / SYNTHETIC D1 INDEX BENCHMARK - OFFLINE TEST
echo No Cloudflare, Drive, secrets, deployments or production changes.
node --no-warnings --test ".\tests\step-k.test.mjs"
if errorlevel 1 (echo STEP K LOCAL TESTS FAILED - DO NOT DEPLOY.& pause & exit /b 1)
echo STEP K LOCAL TESTS PASSED - NO DEPLOYMENT.
pause
