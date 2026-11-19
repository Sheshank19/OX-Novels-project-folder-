@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title OX Player B9.1.1 - Admin Login 1101 Fix

echo ============================================================
echo  OX PLAYER B9.1.1 - ADMIN LOGIN 1101 FIX
echo ============================================================
echo.
echo This fixes only the Player Admin successful-login crash.
echo It does not change catalogs, Drive data, OX D1, secrets, or audio streaming.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  pause
  exit /b 1
)

node APPLY-B9.1.1-ADMIN-LOGIN-FIX.mjs
if errorlevel 1 (
  echo.
  echo Fix failed. Nothing should be deployed yet.
  pause
  exit /b 1
)

echo.
echo Fix applied successfully.
echo.
echo NEXT:
echo   Go back to C:\Users\dundi\OX-Novels
echo   Run B9.1-DEPLOY-PLAYER-FOUNDATION.bat
echo.
pause
