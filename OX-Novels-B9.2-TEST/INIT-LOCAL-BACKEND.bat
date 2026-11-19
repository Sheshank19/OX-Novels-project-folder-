@echo off
setlocal
cd /d "%~dp0"
title OX Novels - Initialize Local Backend

echo =====================================================
echo        OX NOVELS - LOCAL BACKEND SETUP
echo =====================================================
echo.

if exist node_modules goto :packages_ready

echo Installing project packages...
call npm.cmd install
if errorlevel 1 goto :error

:packages_ready
if exist .dev.vars goto :password_ready

echo Choose a LOCAL Admin password for this copy.
echo This password stays on this computer in .dev.vars.
echo For this local test, use letters and numbers only - no spaces.
echo.
set "OX_ADMIN_PASSWORD="
set /p "OX_ADMIN_PASSWORD=Admin password: "
if not defined OX_ADMIN_PASSWORD goto :no_password

> .dev.vars echo ADMIN_PASSWORD=%OX_ADMIN_PASSWORD%
echo Local Admin password file created.
echo.

:password_ready
echo Checking D1 configuration...
findstr /C:"d1_databases" wrangler.jsonc >nul
if errorlevel 1 goto :missing_d1
findstr /C:"\"binding\": \"DB\"" wrangler.jsonc >nul
if errorlevel 1 goto :missing_d1
echo D1 binding found.
echo.
echo Creating/updating the LOCAL D1 database...
call npx.cmd wrangler d1 migrations apply DB --local
if errorlevel 1 goto :error

echo.
echo =====================================================
echo Local backend is ready.
echo Admin:  http://localhost:8787/admin.html
echo Public: http://localhost:8787/
echo =====================================================
echo.
echo Starting OX Novels on PC + local Wi-Fi...
call npx.cmd wrangler dev --ip 0.0.0.0 --port 8787
set "WRANGLER_EXIT=%ERRORLEVEL%"
if not "%WRANGLER_EXIT%"=="0" (
  echo.
  echo Wrangler stopped with an error. The window will stay open so you can read it.
  echo Exit code: %WRANGLER_EXIT%
  pause
  exit /b %WRANGLER_EXIT%
)
exit /b 0

:missing_d1
echo.
echo ERROR: This folder does not contain the v11 D1 configuration.
echo Expected DB binding in wrangler.jsonc.
echo Do not continue from a merged/old frontend folder.
goto :error

:no_password
echo.
echo No password entered.
goto :error

:error
echo.
echo Setup did not finish. Read BACKEND-SETUP-FIRST.txt.
pause
exit /b 1
