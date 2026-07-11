$ErrorActionPreference = 'Stop'
$startup = [Environment]::GetFolderPath('Startup')
$vbs = Join-Path $startup 'chorus-daemon-autostart.vbs'
if (Test-Path -LiteralPath $vbs) {
  Remove-Item -LiteralPath $vbs -Force
  Write-Host '=== 已关闭开机自启 ==='
  Write-Host ('已删除启动项: ' + $vbs)
  Write-Host '正在运行的守护进程不受影响；要停止它请在控制台页面点"停止"。'
} else {
  Write-Host '未发现开机自启项（本来就没开启）。'
}
