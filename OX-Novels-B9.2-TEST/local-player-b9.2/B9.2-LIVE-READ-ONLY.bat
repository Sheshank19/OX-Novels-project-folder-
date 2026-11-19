@echo off
setlocal
cd /d "%~dp0.."
echo.
echo OX B9.2 - LIVE RESOLVER READ ONLY CHECK
echo One GET and one POST; no changes to Drive, Apps Script, Cloudflare or production.
echo Does not display secrets, URLs, Drive IDs or filenames.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run this check.
  goto :finish
)
node "local-player-b9.2\live-readonly\check-resolver.mjs"
:finish
echo.
pause
endlocal
