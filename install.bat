@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 goto launcher
where python >nul 2>nul
if errorlevel 1 goto missing
python "%~dp0install.py" --action install --pause
exit /b %errorlevel%
:launcher
py -3 "%~dp0install.py" --action install --pause
exit /b %errorlevel%
:missing
echo Python 3.10 or later is required. Install Python, then run this file again.
pause
exit /b 1
