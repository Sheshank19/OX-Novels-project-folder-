@echo off
setlocal
cd /d "%~dp0.."
echo.
echo OX Player B9.2: LOCAL configuration preparation only.
echo This does NOT deploy to oxnovels.top or change secrets.
echo First create the KV and Queue in your FREE Player Cloudflare account.
echo.
set /p KV_ID=Paste the new B9.2 KV namespace ID (not a secret): 
if "%KV_ID%"=="" exit /b 1
node "local-player-b9.2\scripts\configure.mjs" "%KV_ID%"
if errorlevel 1 (
  echo Configuration not changed.
  pause
  exit /b 1
)
echo.
echo Configuration ready. DO NOT deploy until you have tested locally and approved the rollout.
pause
