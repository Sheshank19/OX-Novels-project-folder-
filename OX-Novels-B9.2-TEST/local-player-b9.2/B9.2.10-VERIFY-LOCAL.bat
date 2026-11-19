@echo off
setlocal
cd /d "%~dp0.."
echo OX B9.2.10 - TEST ONLY - offline Drive change-window and shared-drive coverage guard.
echo No Google Drive calls, Apps Script modification, Cloudflare deployment or production changes.
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
node --test local-player-b9.2/tests/b92.test.mjs local-player-b9.2/tests/b921-safety.test.mjs local-player-b9.2/tests/b921.test.mjs local-player-b9.2/tests/b922.test.mjs local-player-b9.2/tests/b923.test.mjs local-player-b9.2/tests/b924.test.mjs local-player-b9.2/tests/b925.test.mjs local-player-b9.2/tests/b926.test.mjs local-player-b9.2/tests/b927.test.mjs local-player-b9.2/tests/b928.test.mjs local-player-b9.2/tests/b929.test.mjs local-player-b9.2/tests/b9210.test.mjs
if errorlevel 1 (
  echo FAIL: B9.2.10 offline tests failed. Do not deploy.
  exit /b 1
)
echo.
echo PASS: Offline regression checks passed. Live Drive change coverage and Cloudflare CPU have NOT been verified.
echo DO NOT configure, deploy, modify live Apps Script, or enable the scanner.
pause
