@echo off
chcp 65001 >nul 2>&1
title Iris
setlocal

set "INSTALL_DIR=%~dp0..\.."
for %%I in ("%INSTALL_DIR%") do set "INSTALL_DIR=%%~fI"

if defined IRIS_DATA_DIR (
  set "DATA_DIR=%IRIS_DATA_DIR%"
) else (
  set "DATA_DIR=%USERPROFILE%\.iris"
)

set "MAIN_BIN=%INSTALL_DIR%\bin\iris.exe"
if not exist "%MAIN_BIN%" (
  echo [ERROR] 未找到 %MAIN_BIN%
  echo [ERROR] 请先解压 Windows 二进制发行包。
  pause
  exit /b 1
)

set "IRIS_DATA_DIR=%DATA_DIR%"
"%MAIN_BIN%" start
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo Iris 已退出，退出码: %EXIT_CODE%
pause
exit /b %EXIT_CODE%
