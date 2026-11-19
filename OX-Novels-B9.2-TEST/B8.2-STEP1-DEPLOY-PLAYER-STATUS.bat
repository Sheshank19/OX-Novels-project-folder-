@echo off
setlocal
cd /d "%~dp0"
title OX B8.2 - Deploy Player Status Endpoint

echo ============================================================
echo  OX B8.2 - DEPLOY PLAYER STATUS ENDPOINT

echo ============================================================
echo.
echo This uses the existing local-player-b6 build/deploy workflow.
echo The 242 Player catalogs are preserved; B8.2 adds /api/catalog-status.
echo Main oxnovels.top is NOT deployed by this BAT.
echo.
call local-player-b6\BUILD-AND-DEPLOY-CURRENT-PLAYER.bat
exit /b %errorlevel%
