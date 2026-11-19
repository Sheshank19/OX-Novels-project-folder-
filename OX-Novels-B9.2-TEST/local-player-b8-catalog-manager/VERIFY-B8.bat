@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo  VERIFY B8.1
echo ============================================================
echo.
set ERR=0
where node >nul 2>nul || (echo [FAIL] Node.js not found & set ERR=1)
if exist "..\local-player-b6\scripts\common.mjs" (echo [OK] local-player-b6) else (echo [FAIL] local-player-b6 missing & set ERR=1)
if exist "..\local-player-b6\scripts\sync-story.mjs" (echo [OK] B6 sync engine) else (echo [FAIL] B6 sync engine missing & set ERR=1)
if exist "..\local-player-b5" (echo [OK] local-player-b5) else (echo [FAIL] local-player-b5 missing & set ERR=1)
if exist "..\local-audio-lab\config\resolver.local.json" (echo [OK] Resolver config exists) else (echo [FAIL] Resolver config missing & set ERR=1)
echo.
if "%ERR%"=="0" (
  echo B8.1 prerequisites look good.
) else (
  echo Fix the FAIL items above before starting B8.1.
)
pause
exit /b %ERR%
