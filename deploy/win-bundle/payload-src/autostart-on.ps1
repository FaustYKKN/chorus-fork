$ErrorActionPreference = 'Stop'
$bundle = $env:BUNDLE_DIR
if (-not $bundle) { Write-Host '[错误] 缺少 BUNDLE_DIR'; exit 1 }
$chorusMjs = Join-Path $bundle 'chorus\chorus.mjs'
if (-not (Test-Path -LiteralPath $chorusMjs)) {
  Write-Host ('[错误] 未找到 ' + $chorusMjs + '，请把本脚本放回解压目录后再运行')
  exit 1
}
$startup = [Environment]::GetFolderPath('Startup')
$vbs = Join-Path $startup 'chorus-daemon-autostart.vbs'
# VBS 里 "" 表示字面双引号；隐藏窗口(0)启动，不打开浏览器
$cmd = 'cmd /c node ""' + $chorusMjs + '"" daemon -d --agent opencode --yolo'
$content = 'CreateObject("WScript.Shell").Run "' + $cmd + '", 0, False'
Set-Content -LiteralPath $vbs -Value $content -Encoding Unicode
Write-Host '=== 已开启开机自启 ==='
Write-Host ('启动项文件: ' + $vbs)
Write-Host '每次登录 Windows 后，守护进程会自动在后台启动（无窗口）。'
Write-Host '需要看状态时，浏览器打开 http://127.0.0.1:8638 即可。'
Write-Host '取消自启：双击 关闭开机自启.bat'
