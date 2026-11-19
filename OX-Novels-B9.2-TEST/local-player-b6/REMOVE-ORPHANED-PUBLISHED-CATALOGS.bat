@echo off
cd /d "%~dp0"
node scripts\remove-orphans.mjs
pause
