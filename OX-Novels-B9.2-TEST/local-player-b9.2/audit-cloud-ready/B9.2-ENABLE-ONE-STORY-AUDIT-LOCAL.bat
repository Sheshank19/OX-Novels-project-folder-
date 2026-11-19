@echo off
setlocal
cd /d "%~dp0"
echo Use ONLY after new D1 migrations and separate Apps Script resolver secrets are ready.
node scripts\enable-canary-local.mjs
if errorlevel 1 (echo BLOCKED - NOTHING DEPLOYED.& pause & exit /b 1)
echo Local config ready. ONE Wrangler deployment still required to activate the canary.
pause
