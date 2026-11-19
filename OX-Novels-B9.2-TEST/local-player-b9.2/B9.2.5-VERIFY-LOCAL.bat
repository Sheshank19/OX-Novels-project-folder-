@echo off
setlocal
cd /d "%~dp0.."
echo OX B9.2.5 - TEST ONLY - local paginated-resolver contract and durable lease scheduler.
echo NO Cloudflare setup, Google Drive connection, production migrations, or deployments.
echo.
where node >nul 2>nul
if errorlevel 1 (
 echo FAIL: Node.js is not installed. Do not deploy.
 exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "MAJOR=%%v"
if %MAJOR% LSS 22 (
 echo FAIL: Node.js version 22 or newer required for local SQLite tests.
 exit /b 1
)
node --test local-player-b9.2/tests/b92.test.mjs local-player-b9.2/tests/b921-safety.test.mjs local-player-b9.2/tests/b921.test.mjs local-player-b9.2/tests/b922.test.mjs local-player-b9.2/tests/b923.test.mjs local-player-b9.2/tests/b924.test.mjs local-player-b9.2/tests/b925.test.mjs
if errorlevel 1 (
 echo.
 echo FAIL: The local mock tests failed. Keep production unchanged.
 exit /b 1
)
echo.
echo PASS: All local mock tests passed. This does NOT establish Cloudflare CPU compatibility or live Drive correctness.
echo DO NOT run CONFIGURE scripts, remote migrations, or deployments.
pause
