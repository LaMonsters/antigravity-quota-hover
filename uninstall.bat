@echo off
call "%~dp0launcher.cmd" uninstall %*
exit /b %errorlevel%
