@echo off
setlocal
cd /d "%~dp0\.."
if not exist "worker-B3.1.generated.js" (
  echo worker-B3.1.generated.js was not found. Run BUILD-B3.1-FROM-ACTIVE-CATALOG.bat first.
  pause
  exit /b 1
)
node --check worker-B3.1.generated.js
if errorlevel 1 (
  echo JavaScript syntax check FAILED.
  pause
  exit /b 1
)
echo B3.1 generated Worker JavaScript syntax is OK.
pause
