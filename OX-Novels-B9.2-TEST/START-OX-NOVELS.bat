@echo off
setlocal
cd /d "%~dp0"
title OX Novels

if not exist node_modules (
  echo Installing project packages...
  call npm.cmd install
  if errorlevel 1 goto :error
)

if not exist .dev.vars (
  echo.
  echo Backend has not been initialized on this computer yet.
  echo Running INIT-LOCAL-BACKEND.bat first...
  call INIT-LOCAL-BACKEND.bat
  exit /b %errorlevel%
)

echo Checking local D1 migrations...
call npx.cmd wrangler d1 migrations apply ox-novels-db --local
if errorlevel 1 goto :error

echo Starting OX Novels...
call npx.cmd wrangler dev
exit /b %errorlevel%

:error
echo Unable to start OX Novels.
echo Read BACKEND-SETUP-FIRST.txt for setup help.
pause
exit /b 1
