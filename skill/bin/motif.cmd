@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0motif.ps1" %*
exit /b %ERRORLEVEL%
