@echo off
setlocal
cd /d "%~dp0"
title OX Player Catalog Manager - B8.1

echo ============================================================
echo  OX PLAYER CATALOG MANAGER - B8.1
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install/use the same Node.js already used by the OX Player tools.
  pause
  exit /b 1
)

if not exist "..\local-player-b6\scripts\common.mjs" (
  echo local-player-b6 was not found beside this folder.
  echo Keep this folder directly inside C:\Users\dundi\OX-Novels
  pause
  exit /b 1
)

if not exist "..\local-player-b5\B5-PUBLISHED-CATALOGS.json" (
  echo WARNING: B5 published manifest was not found yet.
  echo The dashboard can still open, but published status may be empty until B5 has been built.
  echo.
)

start "" cmd /c "timeout /t 2 /nobreak >nul & start "" http://127.0.0.1:8792"
node server.mjs
echo.
echo B8 manager stopped.
pause
