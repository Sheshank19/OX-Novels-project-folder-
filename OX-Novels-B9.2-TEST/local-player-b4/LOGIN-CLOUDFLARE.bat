@echo off
setlocal
cd /d "%~dp0"
if exist "..\node_modules\.bin\wrangler.cmd" (
  call "..\node_modules\.bin\wrangler.cmd" login
) else (
  call npx.cmd wrangler login
)
pause
