@echo off
setlocal
cd /d "%~dp0.."
echo Checking B9.2 local source and no-production tests...
node --check src\index.js || goto :fail
node --check local-player-b5\src\index.js || goto :fail
node --check local-player-b5\src\worker-B5-template.js || goto :fail
node --check local-player-b5\src\b9-catalog-manager.js || goto :fail
node --test local-player-b9.2\tests\b92.test.mjs || goto :fail
echo.
echo PASS: local mock-only tests. This does NOT verify Cloudflare Free CPU limits.
pause
exit /b 0
:fail
echo.
echo Local verification FAILED. Do not deploy.
pause
exit /b 1
