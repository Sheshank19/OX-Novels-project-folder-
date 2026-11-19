@echo off
setlocal
cd /d "%~dp0\..\.."
echo OX B9.2 - LIVE CATALOG STORAGE INTEGRATION - LOCAL ONLY
echo Existing manager preserved, no cloud or Drive access.
node "%~dp0scripts\apply-local.mjs"
if errorlevel 1 (
  echo PREPARATION STOPPED - NOTHING DEPLOYED.
) else (
  echo LOCAL CATALOG STORAGE PREPARED - NO DEPLOYMENT.
)
pause
