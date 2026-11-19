@echo off
setlocal
cd /d "%~dp0"
node scripts\apply-local-only.mjs
if errorlevel 1 (echo INTEGRATION FAILED - DO NOT DEPLOY & pause & exit /b 1)
echo LOCAL INTEGRATION PREPARED - NOTHING DEPLOYED
pause
