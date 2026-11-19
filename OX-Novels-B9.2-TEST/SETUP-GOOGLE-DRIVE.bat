@echo off
setlocal
cd /d "%~dp0"
title OX Novels - Free Google Drive Setup v15.2

echo =====================================================
echo     OX NOVELS - FREE GOOGLE DRIVE IMPORT v15.2
echo =====================================================
echo.
echo This setup uses one STABLE private Apps Script secret.
echo Re-running this BAT will NOT change the key anymore.
echo.
echo IMPORTANT:
echo   1. Run this BAT and leave this window open.
echo   2. Open apps-script\OX-Drive-Scanner-READY.gs.
echo   3. Paste the ENTIRE file into your Apps Script project.
echo   4. Drive API service is optional in v15.2; it can stay enabled.
echo   5. Save and deploy a NEW VERSION as Web app.
echo      Execute as: Me
 echo      Who has access: Anyone
echo   6. Come back here and paste the script.google.com/.../exec URL.
echo.
node scripts\configure-google-drive.mjs
if errorlevel 1 goto :error

echo.
echo Google Drive setup step finished successfully.
pause
exit /b 0
:error
echo.
echo Google Drive setup did not finish.
pause
exit /b 1
