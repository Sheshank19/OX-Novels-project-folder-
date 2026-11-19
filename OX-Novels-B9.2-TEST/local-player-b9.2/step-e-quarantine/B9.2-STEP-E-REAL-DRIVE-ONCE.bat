@echo off
setlocal
cd /d "%~dp0\..\.."
echo OX B9.2 - STEP E / READ-ONLY ONE-STORY DRIVE SCAN
 echo This requests real Drive metadata, and when changed makes one PRIVATE local quarantine pair.
 echo No KV/D1 writes, catalog publishing, or production changes.
echo.
node --no-warnings local-player-b9.2\step-e-quarantine\src\step-e-real-once.mjs
if errorlevel 1 (echo Step E incomplete. Do not repeat blindly.) else (echo Step E complete. No catalog published.)
pause
endlocal
