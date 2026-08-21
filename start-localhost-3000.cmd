@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-localhost-3000.ps1"

if errorlevel 1 (
  echo.
  echo Failed to start AI_PDM at http://localhost:3000/
  echo See the message above for the process currently using port 3000.
  pause
)
