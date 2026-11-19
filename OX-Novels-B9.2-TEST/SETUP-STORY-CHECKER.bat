@echo off
setlocal
cd /d "%~dp0"
title OX Novels - Free Gemini Story Checker

echo =====================================================
echo       OX NOVELS - FREE GEMINI STORY CHECKER
echo =====================================================
echo.
echo Use a Gemini API key from Google AI Studio.
echo Do NOT enable paid billing for this OX free-only setup.
echo.
echo If you prefer no API at all, skip this file and use:
echo Admin ^> Story Checks ^> Manual Gemini.
echo.
node scripts\configure-story-checker.mjs
if errorlevel 1 goto :error

echo.
echo Setup saved. Restart INIT-LOCAL-BACKEND.bat.
pause
exit /b 0
:error
echo.
echo Story Checker setup did not finish.
pause
exit /b 1
