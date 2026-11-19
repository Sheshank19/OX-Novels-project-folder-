@echo off
setlocal
cd /d "%~dp0"
title OX Player - Import Production Story Snapshot

echo ============================================================
echo  IMPORT PRODUCTION PLAYER STORY SNAPSHOT

echo ============================================================
echo.
echo In OX Admin ^> Player Catalogs, click "Export production snapshot" first.
echo Then paste or drag the downloaded PRODUCTION-STORY-SNAPSHOT.json path below.
echo.
set "SNAPSHOT="
set /p "SNAPSHOT=Snapshot JSON path: "
if not defined SNAPSHOT goto :missing
set "SNAPSHOT=%SNAPSHOT:"=%"
node scripts\import-production-snapshot.mjs "%SNAPSHOT%"
if errorlevel 1 goto :error

echo.
echo Snapshot imported successfully.
pause
exit /b 0

:missing
echo No file path was provided.
goto :error

:error
echo.
echo Import failed. The previous B6 snapshot, if any, was not intentionally replaced.
pause
exit /b 1
