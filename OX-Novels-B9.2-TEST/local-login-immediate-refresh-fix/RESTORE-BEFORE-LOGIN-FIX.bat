@echo off
setlocal
cd /d "%~dp0.."
if not exist ".\local-login-immediate-refresh-fix\backups\app.js.before-login-immediate-refresh-fix" (
  echo Backup not found. Nothing restored.
  pause
  exit /b 1
)
copy /Y ".\local-login-immediate-refresh-fix\backups\app.js.before-login-immediate-refresh-fix" ".\public\assets\app.js" >nul
if errorlevel 1 (
  echo Restore failed.
) else (
  echo Restored app.js to the state immediately before this login fix.
)
pause
