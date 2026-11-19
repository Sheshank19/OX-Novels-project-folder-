@echo off
setlocal EnableExtensions
cd /d "%~dp0local-player-b5"
title OX Player B9.1 - Deploy Foundation

echo ============================================================
echo  DEPLOY PLAYER B9.1 FOUNDATION
 echo ============================================================
if not exist ".player-account-id" (
  echo Player account target is missing.
  pause
  exit /b 1
)
for /f "usebackq delims=" %%A in (".player-account-id") do set "CLOUDFLARE_ACCOUNT_ID=%%A"
if "%CLOUDFLARE_ACCOUNT_ID%"=="" (echo Player account ID is empty.& pause & exit /b 1)

echo Rebuilding existing 242 static catalogs with the B9.1 Player presentation/admin template...
call BUILD-B5.bat
if errorlevel 1 (echo Build failed. Nothing deployed.& pause & exit /b 1)

echo.
echo Deploying existing Worker: listen
call npx.cmd wrangler deploy --config wrangler.jsonc
if errorlevel 1 (echo Deployment failed.& pause & exit /b 1)

echo.
echo B9.1 Player foundation deployed.
echo Public: https://listen.ox-audio-player.workers.dev/
echo Admin:  https://listen.ox-audio-player.workers.dev/admin
pause
