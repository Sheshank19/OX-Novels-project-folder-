@echo off
setlocal
cd /d "%~dp0.."
echo.
echo OX B9.2.1 - LOCAL ONLY - NO CLOUDFLARE DEPLOYMENT
echo.
if not exist "local-player-b5\B5-PUBLISHED-CATALOGS.json" goto :fail
if not exist "local-audio-lab\cache" goto :fail
node --check "local-player-b5\src\b9-catalog-manager.js" || goto :fail
node --check "local-player-b5\src\b921-chunk-prototype.js" || goto :fail
node --test "local-player-b9.2\tests\b92.test.mjs" "local-player-b9.2\tests\b921.test.mjs" "local-player-b9.2\tests\b921-safety.test.mjs" || goto :fail
echo.
echo PASS: B9.2 and B9.2.1 LOCAL MOCK TESTS ONLY.
echo This does NOT prove Cloudflare 10ms CPU compatibility.
echo DO NOT deploy, create resources, or enable B9 scanner.
pause
exit /b 0
:fail
echo.
echo FAIL: Local verification failed. Do not deploy.
pause
exit /b 1
