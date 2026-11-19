@echo off
setlocal
cd /d "%~dp0"
node scripts\find-next-accessible.mjs
if errorlevel 1 (
  echo.
  echo No accessible second story was found before the scan ended.
)
pause
