@echo off
chcp 65001 >nul
title 启动 Chorus 守护进程
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 node，请先安装 Node 20+
  pause
  exit /b 1
)
node "%~dp0chorus\chorus.mjs" daemon -d --agent opencode --yolo
start "" http://127.0.0.1:8638
timeout /t 3 >nul
exit /b 0
