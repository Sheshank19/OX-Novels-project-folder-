@echo off
setlocal
cd /d "%~dp0"
title OX Player B6.4 - Stream Reliability Diagnostics

echo ==========================================================
echo OX PLAYER ACCOUNT B - B6.4 STREAM RELIABILITY DIAGNOSTICS
echo ==========================================================
echo.
echo This patches local-player-b5 only. Production OX is untouched.
echo.
node apply-fix.mjs
if errorlevel 1 goto :error

echo.
echo B6.4 applied successfully.
echo Now run:
echo   local-player-b6\BUILD-AND-DEPLOY-CURRENT-PLAYER.bat
echo.
pause
exit /b 0
:error
echo.
echo B6.4 did not apply. Read the error above.
pause
exit /b 1
