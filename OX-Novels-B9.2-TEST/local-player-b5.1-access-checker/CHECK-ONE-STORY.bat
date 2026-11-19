@echo off
setlocal
cd /d "%~dp0"
node scripts\check-one-story.mjs
if errorlevel 1 (
  echo.
  echo Access check failed or story is not readable by the resolver.
)
pause
