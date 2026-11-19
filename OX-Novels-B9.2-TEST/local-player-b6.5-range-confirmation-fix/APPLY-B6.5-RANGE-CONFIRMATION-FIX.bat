@echo off
setlocal
cd /d "%~dp0"
title OX Player B6.5 - Range and Drive Confirmation Fix

echo ============================================================
echo OX PLAYER ACCOUNT B - B6.5 RANGE + DRIVE CONFIRMATION FIX
echo ============================================================
echo.
node apply-fix.mjs
if errorlevel 1 goto :error
echo.
echo B6.5 fix applied successfully.
echo.
echo Next run:
echo   ..\local-player-b6\BUILD-AND-DEPLOY-CURRENT-PLAYER.bat
echo.
pause
exit /b 0

:error
echo.
echo B6.5 did not apply. No deployment was performed.
pause
exit /b 1
