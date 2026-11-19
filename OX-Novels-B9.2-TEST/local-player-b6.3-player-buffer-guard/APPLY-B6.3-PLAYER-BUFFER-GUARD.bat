@echo off
setlocal
cd /d "%~dp0"
title OX Player B6.3 - Buffer Guard

echo =====================================================
echo       OX PLAYER B6.3 - PLAYER BUFFER GUARD
echo =====================================================
echo.
node "%~dp0apply-fix.mjs"
if errorlevel 1 goto :fail

echo.
echo B6.3 Player Buffer Guard applied successfully.
echo.
echo NEXT:
echo   1. Go to ..\local-player-b6

echo   2. Run BUILD-AND-DEPLOY-CURRENT-PLAYER.bat

echo   3. Test a large M4B and rapid episode clicks.
echo.
pause
exit /b 0

:fail
echo.
echo B6.3 was NOT applied. Read the error above.
pause
exit /b 1
