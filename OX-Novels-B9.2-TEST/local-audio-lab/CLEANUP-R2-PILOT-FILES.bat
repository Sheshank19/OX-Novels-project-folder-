@echo off
setlocal
set ROOT=%~dp0
for %%F in (R2-CORS.json r2-signing.mjs setup-r2.mjs SETUP-R2-PRIVATE-DELIVERY.bat README-v3.5.txt) do (
  if exist "%ROOT%%%F" del /q "%ROOT%%%F"
)
if exist "%ROOT%config\r2.local.json" del /q "%ROOT%config\r2.local.json"
if exist "%ROOT%config\r2.local.example.json" del /q "%ROOT%config\r2.local.example.json"
if exist "%ROOT%cache\r2-private-manifest.json" del /q "%ROOT%cache\r2-private-manifest.json"
echo R2 pilot files removed. resolver.local.json was preserved.
pause
