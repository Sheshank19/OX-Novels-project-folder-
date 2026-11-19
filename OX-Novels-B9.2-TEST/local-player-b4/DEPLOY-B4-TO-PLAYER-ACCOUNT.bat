@echo off
setlocal
cd /d "%~dp0"
if not exist .player-account-id (
  echo Missing .player-account-id
  echo Run SET-PLAYER-ACCOUNT-ID.bat first.
  pause
  exit /b 1
)
set /p CLOUDFLARE_ACCOUNT_ID=<.player-account-id
if "%CLOUDFLARE_ACCOUNT_ID%"=="" (
  echo Player Account ID file is empty.
  pause
  exit /b 1
)
call node scripts\build-b4.mjs
if errorlevel 1 goto :error
call node --check src\index.js
if errorlevel 1 goto :error
echo.
echo Deploy target: OX Audio Player account ID %CLOUDFLARE_ACCOUNT_ID%
echo Worker name: listen
echo Existing OX_HANDOFF_KEY secret remains attached to the same Worker unless you delete it in Cloudflare.
echo.
if exist "..\node_modules\.bin\wrangler.cmd" (
  call "..\node_modules\.bin\wrangler.cmd" deploy
) else (
  call npx.cmd wrangler deploy
)
if errorlevel 1 goto :error
echo.
echo B4 deployment completed.
pause
exit /b 0
:error
echo.
echo B4 deployment failed. Check the message above. Your previous deployed version remains available if Cloudflare rejected the deployment.
pause
exit /b 1
