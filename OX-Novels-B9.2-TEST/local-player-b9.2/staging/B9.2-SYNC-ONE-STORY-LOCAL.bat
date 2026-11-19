@echo off
setlocal
cd /d "%~dp0\..\.."
echo OX B9.2 - REAL STAGING DRIVE TO CATALOG - SINGLE STORY / READ ONLY
echo Uses paginated nonce-bound staging resolver. No Google Drive writes.
echo No Worker, KV, D1 writes, catalog activation, or deployment.
echo An unchanged scan skips the second Drive read and catalog generation.
echo.
node --version
node --no-warnings local-player-b9.2\staging\sync-one-story-local.mjs
if errorlevel 1 (
 echo.
 echo FAILED SAFELY. Saved audit baseline and all deployed catalogs unchanged.
) else (
 echo.
 echo STEP A ONLY. Any prepared candidate is PRIVATE. Do NOT deploy it.
)
pause
endlocal
