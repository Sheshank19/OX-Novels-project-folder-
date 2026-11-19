@echo off
setlocal
cd /d "%~dp0.."
echo OX B9.2.2 - TEST ONLY - no Cloudflare resources and no production changes.
echo.
where node >nul 2>nul
if errorlevel 1 (
 echo FAIL: Node.js is not on PATH.
 exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "MAJOR=%%v"
if %MAJOR% LSS 22 (
 echo FAIL: Node.js 22 or newer is needed for built-in SQLite tests.
 exit /b 1
)
node --test local-player-b9.2/tests/b92.test.mjs local-player-b9.2/tests/b921-safety.test.mjs local-player-b9.2/tests/b921.test.mjs local-player-b9.2/tests/b922.test.mjs
if errorlevel 1 (
 echo.
 echo FAIL: Tests did not all pass. DO NOT deploy.
 exit /b 1
)
echo.
echo PASS: LOCAL TESTS ONLY. Production is unchanged.
echo B9.2.2 does NOT validate Worker CPU, Queue/D1 live quotas or automatic publication.
echo Do NOT run any Cloudflare setup or deploy scripts.
pause
