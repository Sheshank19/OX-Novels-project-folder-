@echo off
cd /d "%~dp0"
set FAIL=0
for %%F in (scripts\common.mjs scripts\audit.mjs scripts\sync-story.mjs scripts\batch-sync.mjs scripts\remove-orphans.mjs scripts\access-audit.mjs scripts\import-snapshot.mjs) do (
  node --check "%%F" >nul 2>&1
  if errorlevel 1 (
    echo FAIL %%F
    set FAIL=1
  ) else (
    echo OK   %%F
  )
)
if "%FAIL%"=="1" (
  echo.
  echo B6 verification FAILED.
  pause
  exit /b 1
)
echo.
echo B6 syntax verification passed.
pause
