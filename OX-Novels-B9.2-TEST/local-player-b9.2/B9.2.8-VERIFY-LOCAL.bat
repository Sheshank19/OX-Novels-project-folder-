@echo off
setlocal
cd /d "%~dp0.."
echo OX B9.2.8 - TEST ONLY - mutation-aware DriveApp dual scan audit.
echo No Google Drive connections, Cloudflare resources or deployments.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo FAIL: Node.js not installed.
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "MAJOR=%%v"
if %MAJOR% LSS 22 (
  echo FAIL: Node.js 22 or newer is required.
  exit /b 1
)
node --test local-player-b9.2/tests/b92.test.mjs local-player-b9.2/tests/b921-safety.test.mjs local-player-b9.2/tests/b921.test.mjs local-player-b9.2/tests/b922.test.mjs local-player-b9.2/tests/b923.test.mjs local-player-b9.2/tests/b924.test.mjs local-player-b9.2/tests/b925.test.mjs local-player-b9.2/tests/b926.test.mjs local-player-b9.2/tests/b927.test.mjs local-player-b9.2/tests/b928.test.mjs
if errorlevel 1 (
  echo FAIL: B9.2.8 offline tests failed. Do not deploy.
  exit /b 1
)
echo.
echo PASS: Local-only checks. TWO identical passes do NOT prove a pinned snapshot.
echo DO NOT deploy, modify Apps Script, enable B9 scanner or configure Cloudflare.
pause
