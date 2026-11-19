@echo off
setlocal
cd /d "%~dp0"
node apply-b4.1-fix.mjs
if errorlevel 1 goto :error
echo.
echo B4.1 catalog-load fix applied locally.
echo Next run: ..\local-player-b4\DEPLOY-B4-TO-PLAYER-ACCOUNT.bat
echo.
pause
exit /b 0
:error
echo.
echo B4.1 fix was NOT applied. Read the error above.
pause
exit /b 1
