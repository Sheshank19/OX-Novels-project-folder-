@echo off
setlocal
cd /d "%~dp0"
title OX Novels - Player Handoff Local Test

if not exist node_modules (
  echo Installing project packages...
  call npm.cmd install
  if errorlevel 1 goto :error
)
if not exist .dev.vars (
  echo Existing OX local backend is not initialized. Run START-OX-NOVELS.bat first.
  pause
  exit /b 1
)
if not exist local-player-handoff\.env.player-handoff (
  echo Missing local-player-handoff\.env.player-handoff
  echo Run local-player-handoff\GENERATE-PLAYER-HANDOFF-KEY.bat first.
  pause
  exit /b 1
)
set /p OX_PLAYER_KEY=<local-player-handoff\.env.player-handoff
if "%OX_PLAYER_KEY%"=="" (
  echo Player handoff key file is empty.
  pause
  exit /b 1
)
echo Checking local D1 migrations...
call npx.cmd wrangler d1 migrations apply ox-novels-db --local
if errorlevel 1 goto :error
echo Starting OX Novels with LOCAL Player handoff variable.
echo .dev.vars is NOT modified.
call npx.cmd wrangler dev --var "OX_HANDOFF_KEY:%OX_PLAYER_KEY%" --var "OX_PLAYER_BASE_URL:https://listen.ox-audio-player.workers.dev"
exit /b %errorlevel%
:error
echo Unable to start the local Player handoff test.
pause
exit /b 1
