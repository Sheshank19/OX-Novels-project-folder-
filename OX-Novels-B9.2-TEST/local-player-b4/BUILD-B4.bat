@echo off
setlocal
cd /d "%~dp0"
node scripts\build-b4.mjs
if errorlevel 1 goto :error
node --check src\index.js
if errorlevel 1 goto :error
echo.
echo B4 build and JavaScript syntax check passed.
pause
exit /b 0
:error
echo.
echo B4 build failed. Nothing should be deployed.
pause
exit /b 1
