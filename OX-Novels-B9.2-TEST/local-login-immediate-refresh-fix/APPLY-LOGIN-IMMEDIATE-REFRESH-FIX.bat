@echo off
setlocal
cd /d "%~dp0.."
node ".\local-login-immediate-refresh-fix\apply-login-refresh-fix.mjs"
if errorlevel 1 (
  echo.
  echo Login refresh fix was NOT applied.
) else (
  echo.
  echo Fix installed. Restart your LOCAL OX server and test Google sign-in again.
)
pause
