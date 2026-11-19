@echo off
setlocal
cd /d "%~dp0"
title OX Player B6.2 - Account Target Fix

echo ============================================================
echo OX PLAYER B6.2 - ACCOUNT TARGET FIX
echo ============================================================
echo.
echo This fixes the B5/B6 mismatch where B4 saves the Player
 echo account ID in .player-account-id but B5 was only checking
 echo local-player-b4\wrangler.jsonc.
echo.
node scripts\apply-fix.mjs
if errorlevel 1 goto :error

echo.
echo ============================================================
echo B6.2 account target fix applied successfully.
echo ============================================================
echo.
echo Next run:
echo   ..\local-player-b6\BUILD-AND-DEPLOY-CURRENT-PLAYER.bat
echo.
pause
exit /b 0

:error
echo.
echo B6.2 fix was NOT applied. Read the error above.
pause
exit /b 1
