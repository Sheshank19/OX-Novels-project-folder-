@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - STEP G / LOCAL PRIVATE CATALOG INSPECTION
 echo No Drive read, no Cloudflare requests, no uploading or publication.
node --no-warnings "scripts\inspect-private-local.mjs"
pause
