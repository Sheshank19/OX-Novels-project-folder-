@echo off
setlocal
cd /d "%~dp0"
title OX B8.2 - Verify

echo ============================================================
echo  OX B8.2 VERIFY

echo ============================================================
echo.
set "ERR=0"
where node >nul 2>nul || (echo [FAIL] Node.js not found & set "ERR=1")
if not exist "src\index.js" (echo [FAIL] src\index.js missing & set "ERR=1")
if not exist "public\assets\admin.js" (echo [FAIL] admin.js missing & set "ERR=1")
if not exist "local-player-b5\src\worker-B5-template.js" (echo [FAIL] B5 template missing & set "ERR=1")
if not exist "local-player-b5\B5-PUBLISHED-CATALOGS.json" (echo [FAIL] B5 manifest missing & set "ERR=1")
if not exist "local-player-b6\BUILD-AND-DEPLOY-CURRENT-PLAYER.bat" (echo [FAIL] B6 deploy missing & set "ERR=1")
if not exist "local-player-b8-catalog-manager\START-B8-PLAYER-CATALOG-MANAGER.bat" (echo [FAIL] B8 manager missing & set "ERR=1")
if "%ERR%"=="1" goto :done
node --check src\index.js || set "ERR=1"
node --check public\assets\admin.js || set "ERR=1"
node --check local-player-b5\src\worker-B5-template.js || set "ERR=1"
node --check local-player-b5\src\index.js || set "ERR=1"
node --check local-player-b8-catalog-manager\server.mjs || set "ERR=1"
node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('local-player-b5/B5-PUBLISHED-CATALOGS.json','utf8'));console.log('[INFO] Published Player catalogs:',(m.catalogs||[]).length);if(!(m.catalogs||[]).length)process.exit(2)" || set "ERR=1"

:done
echo.
if "%ERR%"=="0" (
  echo [OK] B8.2 verification passed.
) else (
  echo [FAIL] B8.2 verification found a problem. Do not deploy yet.
)
pause
exit /b %ERR%
