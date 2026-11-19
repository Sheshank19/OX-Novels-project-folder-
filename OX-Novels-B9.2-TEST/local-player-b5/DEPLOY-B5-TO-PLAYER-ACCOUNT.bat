@echo off
cd /d "%~dp0"
node scripts\import-b4-account.mjs
node scripts\build-b5.mjs
if errorlevel 1 (echo. & echo Build failed. Deployment stopped. & pause & exit /b 1)
call npx wrangler deploy
if errorlevel 1 (echo. & echo B5 deployment failed. & pause & exit /b 1)
echo.
echo B5 deployment completed to the existing listen Worker.
pause
