@echo off
setlocal
cd /d "%~dp0.."
echo OX B9.2.7 - TEST ONLY - experimental DriveApp continuation pagination.
echo NO Google Apps Script changes, Cloudflare deployment, or production modifications.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo FAIL: Node.js is not installed.
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "MAJOR=%%v"
if %MAJOR% LSS 22 (
  echo FAIL: Node.js 22 or newer is required.
  exit /b 1
)
node --test local-player-b9.2/tests/b92.test.mjs local-player-b9.2/tests/b921-safety.test.mjs local-player-b9.2/tests/b921.test.mjs local-player-b9.2/tests/b922.test.mjs local-player-b9.2/tests/b923.test.mjs local-player-b9.2/tests/b924.test.mjs local-player-b9.2/tests/b925.test.mjs local-player-b9.2/tests/b926.test.mjs local-player-b9.2/tests/b927.test.mjs
if errorlevel 1 (
  echo FAIL: B9.2.7 offline tests failed. Do not deploy.
  exit /b 1
)
echo.
echo PASS: Local mocks only. Resolver is NOT snapshot-safe; never deploy.
echo Do NOT copy the GAS test file into a live Google Apps Script project.
pause
