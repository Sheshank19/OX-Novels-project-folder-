@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - DURABLE MULTI-STORY AUDIT / LOCAL SOURCE INTEGRATION
echo No Cloudflare calls, Drive reads, deployments, payments or publication.
node scripts\install-local.mjs
if errorlevel 1 (
 echo SOURCE MERGE BLOCKED - DO NOT DEPLOY
) else (
 echo LOCAL AUTO-SYNC AUDIT SOURCE PREPARED - NOTHING DEPLOYED
)
pause
