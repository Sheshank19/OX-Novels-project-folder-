@echo off
setlocal
cd /d "%~dp0.."
echo OX B9.2.4 - TEST ONLY - compact durable metadata page checkpoints.
echo No Cloudflare resources, no Google Drive connection, no deployment.
echo.
where node >nul 2>nul
if errorlevel 1 (
 echo FAIL: Node.js not found. Do not deploy.
 exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "MAJOR=%%v"
if %MAJOR% LSS 22 (
 echo FAIL: Node.js 22 or newer needed for local SQLite tests.
 exit /b 1
)
node --test local-player-b9.2/tests/b92.test.mjs local-player-b9.2/tests/b921-safety.test.mjs local-player-b9.2/tests/b921.test.mjs local-player-b9.2/tests/b922.test.mjs local-player-b9.2/tests/b923.test.mjs local-player-b9.2/tests/b924.test.mjs
if errorlevel 1 (
 echo.
 echo FAIL: Local tests failed. DO NOT DEPLOY.
 exit /b 1
)
echo.
echo PASS: LOCAL MOCK TESTS ONLY. Production remains unchanged.
echo Does not validate live Drive pagination, D1 quota, Worker CPU or automatic publication.
echo DO NOT run CONFIGURE scripts, remote migrations, deploys, or enable scanner.
pause
