@echo off
setlocal
cd /d "%~dp0\..\.."
echo OX B9.2 - PREPARE ONE REAL STORY CATALOG - LOCAL ONLY
echo Requires saved matching one-story audit and existing Player key.
echo No Google Drive writes, KV/D1/Worker calls, deployments, or publication.
echo.
node --version
node --no-warnings local-player-b9.2\staging\prepare-one-story-catalog.mjs
if errorlevel 1 (
 echo.
 echo FAILED SAFELY. No catalogue published or baseline changed.
) else (
 echo.
 echo PREPARED ONLY. Do NOT deploy the private candidate.
)
pause
endlocal
