@echo off
setlocal
cd /d "%~dp0\.."
node ".\local-player-handoff\restore-player-handoff.mjs"
if errorlevel 1 (
  pause
  exit /b 1
)
pause
