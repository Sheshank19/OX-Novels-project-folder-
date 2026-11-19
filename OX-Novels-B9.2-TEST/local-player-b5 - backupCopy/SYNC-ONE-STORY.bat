@echo off
cd /d "%~dp0"
node scripts\sync-one-story.mjs
if errorlevel 1 (echo. & echo Sync failed. Existing active catalog was not intentionally replaced.)
pause
