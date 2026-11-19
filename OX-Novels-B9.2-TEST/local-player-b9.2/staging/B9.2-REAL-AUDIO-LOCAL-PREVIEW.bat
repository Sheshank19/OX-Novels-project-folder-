@echo off
setlocal
cd /d "%~dp0\..\.."
echo.
echo OX B9.2 - LOCAL REAL DRIVE AUDIO PREVIEW
 echo No Cloudflare / Apps Script calls, no deployed Player changes.
echo This check DOES request small real audio ranges from Google Drive.
echo Close this window or press Ctrl+C to stop the localhost server.
echo.
node --version
node "%~dp0preview-real-audio-local.mjs"
if errorlevel 1 (
 echo.
 echo INCOMPLETE: local real audio preview could not start or finish.
)
echo.
pause
