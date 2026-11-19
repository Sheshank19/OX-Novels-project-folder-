@echo off
cd /d "%~dp0"
if exist PRODUCTION-STORY-SNAPSHOT.json del /q PRODUCTION-STORY-SNAPSHOT.json
echo B6 will use local D1 again.
pause
