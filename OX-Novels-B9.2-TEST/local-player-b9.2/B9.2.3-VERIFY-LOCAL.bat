@echo off
setlocal
cd /d "%~dp0.."
echo OX B9.2.3 - TEST ONLY - 242-story changed-only metadata gate.
echo.
where node >nul 2>nul
if errorlevel 1 (
 echo FAIL: Node.js is not on PATH.
 exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "MAJOR=%%v"
if %MAJOR% LSS 22 (
 echo FAIL: Node.js 22 or newer is needed for SQLite tests.
 exit /b 1
)
node --test local-player-b9.2/tests/b92.test.mjs local-player-b9.2/tests/b921-safety.test.mjs local-player-b9.2/tests/b921.test.mjs local-player-b9.2/tests/b922.test.mjs local-player-b9.2/tests/b923.test.mjs
if errorlevel 1 (
 echo.
 echo FAIL: One or more local tests failed. DO NOT deploy.
 exit /b 1
)
echo.
echo PASS: LOCAL MOCK TESTS ONLY. Production is unchanged.
echo B9.2.3 does NOT prove Cloudflare CPU compatibility, live Drive pagination, or automatic publishing.
echo DO NOT deploy or configure cloud resources.
pause
