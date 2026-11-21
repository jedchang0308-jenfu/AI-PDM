@echo off
setlocal
pushd "%~dp0" || exit /b 1
call npm.cmd run dev:local
set "launchResult=%errorlevel%"
popd
if not "%launchResult%"=="0" pause
exit /b %launchResult%
