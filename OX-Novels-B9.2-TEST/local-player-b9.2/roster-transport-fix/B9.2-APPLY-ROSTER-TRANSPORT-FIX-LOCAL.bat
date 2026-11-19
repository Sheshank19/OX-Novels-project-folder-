@echo off
setlocal
cd /d "%~dp0\..\.."
node "%~dp0scripts\apply.mjs"
if errorlevel 1 (
 echo REPAIR BLOCKED - DO NOT DEPLOY.
 pause
 exit /b 1
)
echo LOCAL FIX READY - nothing deployed yet.
pause
