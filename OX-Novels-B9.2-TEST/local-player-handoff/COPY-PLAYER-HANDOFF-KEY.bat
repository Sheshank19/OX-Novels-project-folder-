@echo off
setlocal
cd /d "%~dp0" || exit /b 1
where node.exe >nul 2>nul
if errorlevel 1 (
  echo STOP: Node.js not found. No key has been copied.
  exit /b 1
)
node.exe "%~dp0VERIFY-AND-COPY-HANDOFF-KEY.mjs"
if errorlevel 1 (
  echo STOP: Verification or clipboard copy failed. Do NOT install OX_HANDOFF_KEY.
  exit /b 1
)
exit /b 0
