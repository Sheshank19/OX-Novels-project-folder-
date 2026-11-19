@echo off
setlocal
cd /d "%~dp0"
node scripts\apply.mjs
if errorlevel 1 (
  echo LOCAL DIAGNOSTIC INSTALL FAILED - DO NOT DEPLOY.
  pause
  exit /b 1
)
echo LOCAL DIAGNOSTIC READY - CLOUD DEPLOYMENT NOT YET PERFORMED.
pause
