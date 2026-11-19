@echo off
setlocal
cd /d "%~dp0"
title OX Player B3 - Build From Active Catalog

echo Building Player Account B Phase B3 from the existing LOCAL active audio catalog...
echo This does NOT deploy anything and does NOT modify .dev.vars.
echo.
node build-b3.mjs
if errorlevel 1 (
  echo.
  echo B3 Worker was NOT generated.
  pause
  exit /b 1
)
echo.
echo B3 Worker generated successfully.
echo Open ..\worker-B3.generated.js and copy ALL code into Cloudflare Player Account B - listen - Edit code.
pause
