@echo off
chcp 65001 >nul 2>&1
title Iris Installer
setlocal

REM ==========================================
REM  Iris Windows 二进制安装辅助脚本
REM
REM  适用场景：
REM    - 已从 GitHub Release 解压得到完整二进制目录
REM    - 当前脚本位于 deploy\windows\install.bat
REM
REM  工作流程：
REM    1. 检查 bin\iris.exe 与模板文件是否存在
REM    2. 初始化 IRIS_DATA_DIR（默认 %USERPROFILE%\.iris）
REM    3. 运行 onboard 配置引导
REM    4. 提示将 bin 目录加入 PATH
REM ==========================================

set "INSTALL_DIR=%~dp0..\.."
for %%I in ("%INSTALL_DIR%") do set "INSTALL_DIR=%%~fI"

if defined IRIS_DATA_DIR (
  set "DATA_DIR=%IRIS_DATA_DIR%"
) else (
  set "DATA_DIR=%USERPROFILE%\.iris"
)

set "CONFIG_DIR=%DATA_DIR%\configs"
set "EXAMPLE_DIR=%INSTALL_DIR%\data\configs.example"
set "MAIN_BIN=%INSTALL_DIR%\bin\iris.exe"
set "ONBOARD_BIN=%INSTALL_DIR%\bin\iris-onboard.exe"

if not exist "%MAIN_BIN%" (
  echo [ERROR] 未找到 %MAIN_BIN%
  echo [ERROR] 请先解压 GitHub Release 的 Windows 二进制包。
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Iris Windows Installer
echo ============================================
echo 安装目录: %INSTALL_DIR%
echo 数据目录: %DATA_DIR%
echo.

if exist "%CONFIG_DIR%" (
  echo [OK] 配置目录已存在，稍后可运行 iris onboard 重新配置
) else (
  mkdir "%CONFIG_DIR%" >nul 2>&1
  if exist "%EXAMPLE_DIR%" (
    copy /Y "%EXAMPLE_DIR%\*.yaml" "%CONFIG_DIR%\" >nul
    echo [OK] 已初始化默认配置模板
  ) else (
    echo [WARN] 未找到配置模板目录: %EXAMPLE_DIR%
  )
)

echo.
echo -- 启动配置引导 --
echo.
set "IRIS_DATA_DIR=%DATA_DIR%"
if exist "%ONBOARD_BIN%" (
  "%ONBOARD_BIN%"
) else (
  echo [WARN] 未找到 iris-onboard.exe，可稍后手动编辑 %CONFIG_DIR%
)

echo.
echo ============================================
echo   安装完成
echo.
echo   启动命令:
echo     %MAIN_BIN% start
echo.
echo   重新配置:
echo     %MAIN_BIN% onboard
echo.
echo   如需直接使用 iris 命令，请将以下目录加入 PATH:
echo     %INSTALL_DIR%\bin
echo ============================================
echo.
pause
exit /b 0
