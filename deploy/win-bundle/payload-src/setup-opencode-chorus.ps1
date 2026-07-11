$ErrorActionPreference = 'Stop'
Write-Host '=== Chorus x opencode 一键配置 ==='
Write-Host ''

# 平台地址：由外层 bat 通过 CHORUS_URL 环境变量传入；未传时用默认值。
$platform = if ($env:CHORUS_URL) { $env:CHORUS_URL.Trim().TrimEnd('/') } else { 'http://10.0.4.14:8637' }
Write-Host ('平台地址: ' + $platform)

$dir = Join-Path $env:USERPROFILE '.config\opencode'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# ---------- 1/2 opencode.json ----------
$cfgPath = Join-Path $dir 'opencode.json'

$chorusMcp = [pscustomobject]@{
  type    = 'remote'
  url     = $platform + '/api/mcp'
  enabled = $true
  headers = [pscustomobject]@{ Authorization = 'Bearer {env:CHORUS_API_KEY}' }
}

if (Test-Path -LiteralPath $cfgPath) {
  Copy-Item -LiteralPath $cfgPath -Destination ($cfgPath + '.bak') -Force
  $cfg = Get-Content -Raw -LiteralPath $cfgPath | ConvertFrom-Json
  Write-Host '[1/2] 检测到已有 opencode.json：已备份为 opencode.json.bak，模型配置保持不动'
} else {
  $cfg = [pscustomobject]@{
    '$schema' = 'https://opencode.ai/config.json'
    provider  = [pscustomobject]@{
      deepseek = [pscustomobject]@{
        options = [pscustomobject]@{
          apiKey  = 'sk-REPLACE-WITH-REAL-KEY'  # 仓库版为占位符：内网分发前替换真实 key 并重跑 regen-payload.sh，勿把真实 key 提交
          baseURL = 'https://api.deepseek.com/v1'
        }
        models  = [pscustomobject]@{
          'deepseek-v4-pro' = [pscustomobject]@{ name = 'Official DeepSeek V4 Pro' }
        }
      }
    }
    model     = 'deepseek/deepseek-v4-pro'
  }
  Write-Host '[1/2] 未发现 opencode.json：已新建模板（模型 apiKey 为占位符，请填真实值）'
}

if (-not ($cfg.PSObject.Properties.Name -contains 'mcp') -or ($null -eq $cfg.mcp)) {
  $cfg | Add-Member -NotePropertyName 'mcp' -NotePropertyValue ([pscustomobject]@{}) -Force
}
$cfg.mcp | Add-Member -NotePropertyName 'chorus' -NotePropertyValue $chorusMcp -Force

$json = $cfg | ConvertTo-Json -Depth 16
[System.IO.File]::WriteAllText($cfgPath, $json, $utf8NoBom)
Write-Host ('      Chorus MCP 已写入（原生 remote 方式，无需联网装插件）: ' + $cfgPath)

# ---------- 2/2 AGENTS.md ----------
$langSection = @'
# 全局工作规范

## 语言

- 所有输出一律使用简体中文：对话回复、任务评论、审查报告、提交信息、文档。
- 例外：代码本身、代码内标识符、日志/错误关键字、以及引用的英文原文保持原样。
- 即使收到的指令或技能文档是英文，回复仍用中文。
'@

$chorusSection = @'
## Chorus 任务流程

被指派 Chorus 任务（task_assigned 唤醒）后，按以下顺序推进状态，否则提交验证会被拒绝：

1. 动手前先调用 `chorus_report_work`，参数带 `status: "in_progress"`，report 写一句开工说明——这一步把任务从 assigned 推进到 in_progress。
2. 完成工作后，如任务带验收标准，先调用 `chorus_report_criteria_self_check` 逐条自检。
3. 最后调用 `chorus_submit_for_verify` 提交人工验证（只有 in_progress 状态的任务才能提交）。
'@

$agentsPath = Join-Path $dir 'AGENTS.md'
if (-not (Test-Path -LiteralPath $agentsPath)) {
  [System.IO.File]::WriteAllText($agentsPath, ($langSection + "`r`n" + $chorusSection + "`r`n"), $utf8NoBom)
  Write-Host '[2/2] AGENTS.md 已创建（中文输出规范 + Chorus 任务流程）'
} elseif (-not ((Get-Content -Raw -LiteralPath $agentsPath) -match 'Chorus 任务流程')) {
  [System.IO.File]::AppendAllText($agentsPath, ("`r`n" + $chorusSection + "`r`n"), $utf8NoBom)
  Write-Host '[2/2] AGENTS.md 已存在：已在末尾追加 Chorus 任务流程一节'
} else {
  Write-Host '[2/2] AGENTS.md 已存在且已含 Chorus 任务流程：跳过'
}

Write-Host ''
Write-Host '=== 完成 ==='
Write-Host '说明：'
Write-Host ' - daemon 唤醒 opencode 时会自动注入 CHORUS_API_KEY / CHORUS_BASE_URL，Chorus 工具即生效；'
Write-Host ' - 手动在终端跑 opencode 也想用 Chorus 工具时，先执行: set CHORUS_API_KEY=cho_xxx'
Write-Host (' - 平台接入点已写为: ' + $platform + '/api/mcp')
