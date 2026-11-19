@echo off
setlocal
cd /d "%~dp0"
title OX Player B6.1 - Windows Batch Path Fix

set "TARGET=..\local-player-b6\scripts\batch-sync.mjs"
set "SOURCE=%~dp0files\scripts\batch-sync.mjs"

if not exist "%TARGET%" (
  echo ERROR: local-player-b6 was not found beside this fix folder.
  echo Expected: %CD%\..\local-player-b6
  echo.
  pause
  exit /b 1
)

if not exist "%SOURCE%" (
  echo ERROR: Replacement batch-sync.mjs is missing from this fix package.
  pause
  exit /b 1
)

if not exist "backup" mkdir "backup"
copy /y "%TARGET%" "backup\batch-sync.mjs.before-b6.1" >nul
if errorlevel 1 goto :fail

copy /y "%SOURCE%" "%TARGET%" >nul
if errorlevel 1 goto :fail

node --check "%TARGET%" >nul 2>&1
if errorlevel 1 (
  echo ERROR: The patched script failed Node syntax verification.
  copy /y "backup\batch-sync.mjs.before-b6.1" "%TARGET%" >nul
  echo Original file restored.
  pause
  exit /b 1
)

echo ==========================================================
echo B6.1 Windows path fix applied successfully.
echo ==========================================================
echo.
echo Fixed the C:\C:\Users\... MODULE_NOT_FOUND bug in:
echo   local-player-b6\scripts\batch-sync.mjs
echo.
echo Backup created at:
echo   %CD%\backup\batch-sync.mjs.before-b6.1
echo.
echo No catalog, D1, Drive, secret, or production data was changed.
echo.
echo NEXT:
echo   Run local-player-b6\PREPARE-MISSING-STORIES-BATCH.bat again
echo   and enter 5.
echo.
pause
exit /b 0

:fail
echo.
echo ERROR: Fix could not be applied.
pause
exit /b 1
