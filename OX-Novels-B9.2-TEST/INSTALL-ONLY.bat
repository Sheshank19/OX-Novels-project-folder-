@echo off
title OX Novels - Install
cd /d "%~dp0"
echo Installing OX Novels packages...
echo.
call npm.cmd install
echo.
echo Done.
pause
