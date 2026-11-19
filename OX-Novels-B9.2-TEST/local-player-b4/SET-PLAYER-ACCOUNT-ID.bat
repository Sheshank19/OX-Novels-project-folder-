@echo off
setlocal
cd /d "%~dp0"
node scripts\configure-account.mjs
pause
