@echo off
setlocal
rem Windows PowerShell must not inherit a PowerShell 7 module path, or built-in commands go missing.
set "PSModulePath="
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0motif.ps1" %*
exit /b %ERRORLEVEL%
