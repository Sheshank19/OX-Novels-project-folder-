@echo off
cd /d "%~dp0"
node scripts\sync-story.mjs
if errorlevel 1 echo. & echo Preparation failed. Previous active catalog was not intentionally replaced.
pause
