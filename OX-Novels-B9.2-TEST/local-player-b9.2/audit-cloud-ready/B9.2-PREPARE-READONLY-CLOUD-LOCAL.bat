@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - CONNECT ISOLATED READ-ONLY AUDIT TO EXISTING PLAYER SOURCE
set /p B92_AUDIT_D1_ID=Paste NEW B92 audit D1 database ID (UUID): 
node scripts\merge-real-audit.mjs "%B92_AUDIT_D1_ID%"
if errorlevel 1 (echo PREPARATION BLOCKED - NOTHING DEPLOYED.& pause & exit /b 1)
echo SUCCESS - LOCAL CONFIG ONLY. AUDIT MODE OFF. NOTHING DEPLOYED.
pause
