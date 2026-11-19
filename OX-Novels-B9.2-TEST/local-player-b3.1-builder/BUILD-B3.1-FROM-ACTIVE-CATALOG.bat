@echo off
setlocal
cd /d "%~dp0"
node build-b3.1.mjs
if errorlevel 1 (
  echo.
  echo B3.1 build FAILED. Nothing was deployed to Cloudflare.
  pause
  exit /b 1
)
echo.
echo B3.1 build complete. Deploy worker-B3.1.generated.js to Player Account B ^> listen ^> Edit code.
pause
