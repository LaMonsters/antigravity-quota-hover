@echo off
call "%~dp0launcher.cmd" install %*
exit /b %errorlevel%
