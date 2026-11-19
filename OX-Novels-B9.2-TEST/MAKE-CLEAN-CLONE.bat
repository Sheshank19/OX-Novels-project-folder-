@echo off
setlocal
cd /d "%~dp0"
title OX Novels - Make Clean Clone

echo =====================================================
echo        OX NOVELS - CLEAN CLONE GENERATOR
echo =====================================================
echo.
echo This creates a fresh project ZIP for another owner.
echo It will NOT include your .dev.vars, local D1, users,
echo chats, payments, sessions, backups, or private secrets.
echo.

if not exist node_modules (
  echo Installing project packages first...
  call npm.cmd install
  if errorlevel 1 goto :error
)

call node.exe scripts\make-clean-clone.mjs
if errorlevel 1 goto :error

echo.
echo Clean clone finished.
pause
exit /b 0

:error
echo.
echo Clean clone could not be created. Read the error above.
pause
exit /b 1
