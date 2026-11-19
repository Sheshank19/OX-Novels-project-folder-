@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - REAL STAGING PAGINATION READ-ONLY CHECK
echo No production deployment, Drive changes, or catalog publication.
echo.
node probe-stage.mjs
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (echo PASS: staging read-only check.) else (echo NOT PASSED: check README-FIRST.md and local staging settings.)
pause
exit /b %RESULT%
