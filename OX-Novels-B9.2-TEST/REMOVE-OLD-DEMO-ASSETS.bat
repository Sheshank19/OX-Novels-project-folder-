@echo off
setlocal
cd /d "%~dp0"
echo Removing old bundled demo cover files...
for %%F in (alpha-bride heir-in-hiding owen-and-liam royal-accident twists-love-revenge weakest-beast-tamer when-hearts-refuse wolves-blood-moon) do if exist "public\covers\%%F.svg" del /q "public\covers\%%F.svg"
echo Done. Real uploaded covers stored in D1 are not affected.
pause
