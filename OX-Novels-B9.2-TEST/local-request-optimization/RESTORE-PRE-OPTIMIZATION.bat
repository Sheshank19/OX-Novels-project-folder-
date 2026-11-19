@echo off
cd /d "%~dp0"
node restore-request-optimization.mjs
if errorlevel 1 pause & exit /b 1
pause
