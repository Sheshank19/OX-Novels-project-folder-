@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - STEP K / SYNTHETIC D1 SQL SEED - LOCAL ONLY
echo This creates synthetic-seed.sql in this folder. Does NOT connect to Cloudflare.
node ".\scripts\generate-synthetic-seed.mjs"
if errorlevel 1 (echo Seed generation failed or file already exists. Do not overwrite blindly. & pause & exit /b 1)
echo Seed SQL generated locally only.
pause
