@echo off
setlocal
chcp 65001 >nul
if exist "%~dp0runtime\node.exe" goto portable
where node.exe >nul 2>nul
if errorlevel 1 goto missing
node.exe "%~dp0bundle.js" %*
goto done
:portable
"%~dp0runtime\node.exe" "%~dp0bundle.js" %*
goto done
:missing
echo Please download Antigravity-ZH-Quota-Windows-x64.zip from the project's GitHub Releases.
echo The release includes its own Node.js runtime. Source code ZIPs require Node.js 22 or later.
pause
exit /b 1
:done
set "result=%errorlevel%"
pause
exit /b %result%
