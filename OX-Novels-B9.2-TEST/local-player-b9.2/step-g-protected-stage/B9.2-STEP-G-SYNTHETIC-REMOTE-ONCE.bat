@echo off
setlocal
cd /d "%~dp0"
echo OX B9.2 - STEP G REMOTE SYNTHETIC-ONLY QUARANTINE
 echo Dedicated Step G Worker only. No real catalog files are read or sent.
 echo No Player, Drive, D1, scripts or production calls.
 if "%B92_STEP_G_TOKEN%"=="" (
   echo CHECK STATUS : NOT RUN - B92_STEP_G_TOKEN NOT SET IN THIS TERMINAL
   echo Please launch from your authorized PowerShell session.
   exit /b 1
 )
node --no-warnings scripts\remote-synthetic-vault-once.mjs
if errorlevel 1 (
  echo STOP: CHECK FAILED. DO NOT RUN AGAIN UNTIL THE RESULT IS REVIEWED.
  exit /b 1
)
echo STEP G SYNTHETIC REMOTE CHECK FINISHED. NO PRIVATE CATALOG UPLOADED.
endlocal
