@echo off
setlocal
cd /d "%~dp0"
node scripts\check-all-sources.mjs
pause
