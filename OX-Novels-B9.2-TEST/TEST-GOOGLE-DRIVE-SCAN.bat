@echo off
setlocal
cd /d "%~dp0"
echo OX Novels - Google Drive scanner timing/debug test
echo.
node scripts\test-google-drive.mjs
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" echo Test ended with an error.
pause
exit /b %ERR%
