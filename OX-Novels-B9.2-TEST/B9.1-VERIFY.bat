@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo  OX B9.1 VERIFY
echo ============================================================
set ERR=0
where node >nul 2>nul || (echo [FAIL] Node.js not found & set ERR=1)
if exist "src\index.js" (echo [OK] Main OX Worker) else (echo [FAIL] src\index.js missing & set ERR=1)
if exist "public\assets\app.js" (echo [OK] Public app) else (echo [FAIL] public app missing & set ERR=1)
if exist "public\assets\admin.js" (echo [OK] Admin app) else (echo [FAIL] admin app missing & set ERR=1)
if exist "local-player-b5\src\worker-B5-template.js" (echo [OK] Player template) else (echo [FAIL] Player template missing & set ERR=1)
if exist "local-player-b5\.player-account-id" (echo [OK] Saved Player Account target) else (echo [WARN] .player-account-id missing - use your existing B4/B5 Player account setup before deployment)
echo.
node --check "src\index.js" || set ERR=1
node --check "public\assets\app.js" || set ERR=1
node --check "public\assets\admin.js" || set ERR=1
node --check "local-player-b5\src\worker-B5-template.js" || set ERR=1
node --check "local-player-b5\src\index.js" || set ERR=1
echo.
if "%ERR%"=="0" (echo [OK] B9.1 verification passed.) else (echo [FAIL] Fix the errors above.)
pause
exit /b %ERR%
