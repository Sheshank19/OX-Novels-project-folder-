@echo off
setlocal
cd /d "%~dp0.."
echo OX B9.2.6 - TEST ONLY - atomic SQLite lease fencing.
echo NO Cloudflare resources, Google Drive connection, remote migrations or deployment.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo FAIL: Node.js is not installed. Do not deploy.
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "MAJOR=%%v"
if %MAJOR% LSS 22 (
  echo FAIL: Node.js 22 or newer required for local SQLite.
  exit /b 1
)
node --test local-player-b9.2/tests/b92.test.mjs local-player-b9.2/tests/b921-safety.test.mjs local-player-b9.2/tests/b921.test.mjs local-player-b9.2/tests/b922.test.mjs local-player-b9.2/tests/b923.test.mjs local-player-b9.2/tests/b924.test.mjs local-player-b9.2/tests/b925.test.mjs local-player-b9.2/tests/b926.test.mjs
if errorlevel 1 (
  echo.
  echo FAIL: The offline tests did not pass. Do not apply changes to production.
  exit /b 1
)
echo.
echo PASS: OFFLINE SQLite MOCK TESTS ONLY. This does NOT verify remote D1 or Worker CPU.
echo Never run CONFIGURE scripts, remote migrations, deploys or enable B9 scanner.
pause
