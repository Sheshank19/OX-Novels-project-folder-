@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - DURABLE AUDIT INTEGRITY - LOCAL SOURCE UPGRADE
node ".\scripts\merge-integrity-local.mjs"
if errorlevel 1 (
  echo INSTALLATION FAILED - NOTHING DEPLOYED.
  pause
  exit /b 1
)
pause
