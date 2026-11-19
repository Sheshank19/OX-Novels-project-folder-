@echo off
cd /d "%~dp0"
node --check src\worker-B5-template.js
node --check scripts\sync-one-story.mjs
node --check scripts\build-b5.mjs
if errorlevel 1 (echo Verification failed. & pause & exit /b 1)
echo B5 JavaScript syntax checks passed.
pause
