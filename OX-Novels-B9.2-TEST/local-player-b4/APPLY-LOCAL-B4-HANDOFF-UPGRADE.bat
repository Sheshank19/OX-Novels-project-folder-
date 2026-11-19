@echo off
setlocal
cd /d "%~dp0"
node scripts\upgrade-local-handoff-b4.mjs
if errorlevel 1 goto :error
echo.
echo B4 local handoff metadata upgrade applied.
pause
exit /b 0
:error
echo.
echo B4 handoff upgrade was NOT applied.
pause
exit /b 1
