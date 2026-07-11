#!/usr/bin/env bash
# 重新嵌入 bat 的 PowerShell payload。用法:
#   ./regen-payload.sh 一键安装.bat payload-src/setup-opencode-chorus.ps1
#   ./regen-payload.sh 开启开机自启.bat payload-src/autostart-on.ps1
#   ./regen-payload.sh 关闭开机自启.bat payload-src/autostart-off.ps1
#
# 机制：bat 末尾的 ::PS64: 行是对应 ps1 的 base64（UTF-8）。bat 头部的 powershell
# 一行会读取自身文件、拼接解码并 Invoke-Expression——这样 bat 内不出现任何需要
# cmd 转义的 PowerShell 语法，且中文/引号/换行全部安全。改 ps1 后必须重跑本脚本。
set -euo pipefail
bat="$1"
ps1="$2"
tmp="$(mktemp)"
grep -v '^::PS64:' "$bat" > "$tmp"
base64 -w0 "$ps1" | fold -w 96 | sed 's/^/::PS64:/; s/$/\r/' >> "$tmp"
mv "$tmp" "$bat"
# 回环校验：解出的内容必须与源 ps1 逐字节一致
grep '^::PS64:' "$bat" | sed 's/^::PS64://; s/\r$//' | tr -d '\n' | base64 -d | diff -q - "$ps1" \
  && echo "已嵌入并校验: $bat ← $ps1"
