@echo off
setlocal EnableExtensions
cd /d "%~dp0local-player-b5"
title OX Player B9.1 - Set Admin Password

echo ============================================================
echo  SET OX PLAYER ADMIN PASSWORD
echo ============================================================
echo This secret is stored by Cloudflare, not in the project files.
echo Use a strong password that you will remember.
echo.
if not exist ".player-account-id" (
  echo Player account target is missing.
  echo Restore/use your existing saved .player-account-id first.
  pause
  exit /b 1
)
for /f "usebackq delims=" %%A in (".player-account-id") do set "CLOUDFLARE_ACCOUNT_ID=%%A"
if "%CLOUDFLARE_ACCOUNT_ID%"=="" (
  echo Saved Player account ID is empty.
  pause
  exit /b 1
)
echo Target: OX Audio Player account
call npx.cmd wrangler secret put PLAYER_ADMIN_PASSWORD --config wrangler.jsonc
if errorlevel 1 (
  echo.
  echo Secret setup failed. Nothing was changed in OX production.
  pause
  exit /b 1
)
echo.
echo PLAYER_ADMIN_PASSWORD saved to the Player Worker.
pause
