@echo off
setlocal

set "NPM_CMD="

if exist "C:\Program Files\nodejs\npm.cmd" (
  set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
)

if not defined NPM_CMD (
  for %%I in (npm.cmd) do set "NPM_CMD=%%~$PATH:I"
)

if not defined NPM_CMD (
  echo [错误] 未找到 npm。
  echo 请先安装 Node.js LTS，然后重新打开终端再试。
  echo 下载地址: https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] 正在安装依赖...
  call "%NPM_CMD%" install
  if errorlevel 1 (
    echo [错误] 依赖安装失败。
    pause
    exit /b 1
  )
)

if not exist "dist" (
  echo [2/3] 正在构建生产文件...
  call "%NPM_CMD%" run build
  if errorlevel 1 (
    echo [错误] 构建失败。
    pause
    exit /b 1
  )
)

echo [3/3] 正在启动服务...
call "%NPM_CMD%" run start

if errorlevel 1 (
  echo [错误] 启动失败。
  pause
  exit /b 1
)

endlocal
