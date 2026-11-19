@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - REAL DRIVE ONE-STORY INVENTORY ^(READ-ONLY^)
echo Reads root + all immediate child folders twice; no Google Drive or Cloudflare writes.
echo Local baseline contains keyed hashes only. Do not share local JSON configuration.
echo.
node --version
node scan-one-story-readonly.mjs
if errorlevel 1 (
  echo.
  echo STAGING AUDIT INCOMPLETE. Do not publish catalogs.
) else (
  echo.
  echo STAGING AUDIT PASSED. No catalog publishing was attempted.
)
pause
