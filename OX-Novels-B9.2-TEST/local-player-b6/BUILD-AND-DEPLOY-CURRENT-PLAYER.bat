@echo off
setlocal
cd /d "%~dp0"

if not exist "..\local-player-b5\scripts\build-b5.mjs" (
  echo local-player-b5 was not found beside local-player-b6.
  pause
  exit /b 1
)

pushd "..\local-player-b5"
node scripts\import-b4-account.mjs
if errorlevel 1 goto :fail_pop
node scripts\build-b5.mjs
if errorlevel 1 goto :fail_pop

set "CLOUDFLARE_ACCOUNT_ID="
if exist ".player-account-id" set /p CLOUDFLARE_ACCOUNT_ID=<.player-account-id
if not defined CLOUDFLARE_ACCOUNT_ID if exist "..\local-player-b4\.player-account-id" set /p CLOUDFLARE_ACCOUNT_ID=<"..\local-player-b4\.player-account-id"
if not defined CLOUDFLARE_ACCOUNT_ID (
  echo.
  echo ERROR: OX Audio Player Account ID was not found.
  echo Run local-player-b4\SET-PLAYER-ACCOUNT-ID.bat and try again.
  goto :fail_pop
)

echo.
echo Deploying Worker: listen
echo Target account is loaded from the saved OX Audio Player Account ID.
echo Existing OX_HANDOFF_KEY remains attached to the existing Worker.
echo.
if exist "..\node_modules\.bin\wrangler.cmd" (
  call "..\node_modules\.bin\wrangler.cmd" deploy
) else (
  call npx.cmd wrangler deploy
)
if errorlevel 1 goto :fail_pop

popd
echo.
echo B6 reconciliation build/deploy completed.
pause
exit /b 0

:fail_pop
popd
echo.
echo Build/deploy failed. Existing deployed Player version remains unchanged unless Wrangler reported a successful deployment.
pause
exit /b 1
