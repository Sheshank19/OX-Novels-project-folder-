@echo off
setlocal
cd /d "%~dp0\..\.."
echo OX B9.2 - STAGING CANDIDATE / B5 PLAYER COMPATIBILITY - LOCAL MOCK ONLY
echo No Drive audio access, Cloudflare requests, Apps Script calls, or publishing.
echo.
node --version
node --no-warnings local-player-b9.2\staging\check-prepared-player-compat.mjs
if errorlevel 1 (
 echo.
 echo NOT VERIFIED. Production and private candidate are untouched.
) else (
 echo.
 echo LOCAL COMPATIBILITY ONLY. Do not deploy the private candidate.
)
pause
endlocal
