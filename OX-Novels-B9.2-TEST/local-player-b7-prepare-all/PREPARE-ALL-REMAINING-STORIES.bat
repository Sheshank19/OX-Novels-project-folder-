@echo off
setlocal
cd /d "%~dp0"
title OX Player B7 - Prepare All Remaining Stories

echo ============================================================
echo OX PLAYER B7 - PREPARE ALL REMAINING STORY CATALOGS
echo ============================================================
echo.
echo This does NOT deploy anything.
echo It scans all remaining visible/current stories sequentially.
echo Existing working catalogs stay untouched until each new scan verifies.
echo.
node all-sync.mjs
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo B7 stopped with exit code %RC%.
  echo Already completed story catalogs remain safe and can be resumed by running this BAT again.
) else (
  echo B7 prepare-all command finished.
)
echo.
pause
exit /b %RC%
