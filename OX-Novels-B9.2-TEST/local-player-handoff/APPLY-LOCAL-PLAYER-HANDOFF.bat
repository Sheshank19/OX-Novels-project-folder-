@echo off
setlocal
cd /d "%~dp0\.."
node ".\local-player-handoff\apply-player-handoff.mjs"
if errorlevel 1 (
  echo.
  echo Player handoff patch was NOT applied.
  pause
  exit /b 1
)
echo.
echo Local connector installed. Production OX was not deployed or changed.
pause
