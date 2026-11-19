@echo off
cd /d "%~dp0"
node scripts\sync-one-story.mjs
if errorlevel 1 (echo. & echo Sync failed. Deployment stopped. & pause & exit /b 1)
node scripts\import-b4-account.mjs
node scripts\build-b5.mjs
if errorlevel 1 (echo. & echo Build failed. Deployment stopped. & pause & exit /b 1)
call npx wrangler deploy
if errorlevel 1 (echo. & echo Deployment failed. & pause & exit /b 1)
echo.
echo Story sync and B5 publish completed.
pause
