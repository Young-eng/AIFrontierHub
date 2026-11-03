@echo off
rem Double-click launcher: runs start.ps1 in this window. Close it or press Ctrl+C to stop.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 pause
