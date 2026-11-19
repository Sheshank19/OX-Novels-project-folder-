@echo off
setlocal
cd /d "%~dp0"
node scripts\restore-local-handoff-b4.mjs
pause
