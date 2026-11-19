@echo off
cd /d "%~dp0"
node scripts\import-b4-account.mjs
node scripts\build-b5.mjs
if errorlevel 1 (echo. & echo B5 build failed. Nothing was deployed. & pause & exit /b 1)
echo.
echo B5 build completed. Nothing has been deployed yet.
pause
