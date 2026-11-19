@echo off
setlocal
cd /d "%~dp0\..\.."
echo OX B9.2 - STEP D / ONE REAL DRIVE SCAN TO STAGING-ONLY SIGNAL
 echo IMPORTANT: This is a FUTURE approved stage-only action after applying migration 0002,
 echo deploying ONLY the existing synthetic staging Worker update, and configuring
 echo B92_STEP_C_URL and B92_STEP_C_TOKEN privately in this terminal.
echo NO TRACKS, DRIVE IDS, KEYS OR CATALOGS ARE UPLOADED. NO PUBLICATION.
echo.
if not defined B92_STEP_C_URL (
 echo STOP: B92_STEP_C_URL environment variable missing.
 pause
 exit /b 1
)
if not defined B92_STEP_C_TOKEN (
 echo STOP: B92_STEP_C_TOKEN environment variable missing.
 pause
 exit /b 1
)
node --no-warnings local-player-b9.2\step-d-bridge\scripts\bridge-real-drive-once.mjs
if errorlevel 1 (
 echo STOP. Do not blindly retry; a journal write might have reached Cloudflare.
) else (
 echo STEP D JOURNAL SUCCESS. Synthetic catalog pointers NOT changed.
)
pause
endlocal
