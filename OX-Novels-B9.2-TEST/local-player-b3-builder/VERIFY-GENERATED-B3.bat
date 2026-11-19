@echo off
setlocal
cd /d "%~dp0\.."
if not exist worker-B3.generated.js (
  echo worker-B3.generated.js does not exist yet. Run BUILD-B3-FROM-ACTIVE-CATALOG.bat first.
  pause
  exit /b 1
)
node --check worker-B3.generated.js
if errorlevel 1 (
  echo B3 generated Worker has a JavaScript syntax error.
  pause
  exit /b 1
)
echo B3 generated Worker JavaScript syntax is OK.
pause
