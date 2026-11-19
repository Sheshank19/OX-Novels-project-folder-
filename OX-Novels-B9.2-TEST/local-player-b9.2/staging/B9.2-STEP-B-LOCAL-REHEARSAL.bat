@echo off
setlocal
cd /d "%~dp0\..\.."
echo OX B9.2 - STEP B - LOCAL CATALOG ACTIVATION AND ROLLBACK REHEARSAL
echo Simulates versioned catalog pointers in memory only.
echo NO Drive reads, NO Cloudflare KV/D1/Worker calls, NO deployments.
echo Candidate remains private; no files are activated or moved.
echo.
node --version
node --no-warnings local-player-b9.2\staging\b92-step-b-rehearsal.mjs
if errorlevel 1 (
 echo.
 echo FAILED SAFELY. Nothing activated or published.
) else (
 echo.
 echo LOCAL REHEARSAL ONLY. DO NOT DEPLOY THE PRIVATE CANDIDATE.
)
pause
endlocal
