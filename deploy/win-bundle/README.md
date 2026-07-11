# Windows 接入包（chorus-opencode-win64.zip）

给开发机接入平台用的免 npm 一键包：精简 daemon + 内置 cli 运行时依赖 +
中文名 bat（一键安装 / 启动守护进程 / 开启·关闭开机自启）。目标机只需已装
Node 20+ 和 opencode。

## 构建

```bash
./build-zip.sh [输出路径]     # 默认输出到仓库根 chorus-opencode-win64.zip
```

产物约 5MB。构建脚本自带两道防线：依赖树里发现原生二进制立即中止（保证跨平台）、
包内 `chorus-client.mjs` 导入链冒烟（防再次发生 ERR_MODULE_NOT_FOUND 事故）。

## 目录说明

| 文件 | 作用 |
|---|---|
| `一键安装.bat` | 询问平台地址（回车用默认）→ 配 opencode（模型不动，只加 MCP 与 AGENTS.md）→ login → 设默认工作目录 + 唤醒串行 → 写环境变量（含 CHORUS_URL，防旧值残留劫持） |
| `启动守护进程.bat` | `daemon -d` 后台启动并打开本地控制台 http://127.0.0.1:8638 |
| `开启/关闭开机自启.bat` | 在启动文件夹写/删隐藏启动项（vbs，无窗口不弹浏览器） |
| `tools/configure-daemon.cjs` | 安装时合并 daemon.json（wakeConcurrency=1 + 默认 cwds，幂等） |
| `payload-src/*.ps1` | bat 内嵌 PowerShell 的源码（真正干活的逻辑在这里改） |
| `regen-payload.sh` | 改完 ps1 后重新嵌入对应 bat（含回环校验） |

## 修改 bat 行为的正确姿势

配置逻辑都在 `payload-src/*.ps1`。**不要直接改 bat 里的 ::PS64: 行**——改 ps1，
然后 `./regen-payload.sh <bat> <ps1>` 重新嵌入。bat 的头部（cmd 部分）可以直接改，
但注意保持 CRLF（`.gitattributes` 已声明 `-text` 防止换行被规范化）。

## 已踩过的坑（改动前必读）

- cli **不是**零依赖：`chorus-client.mjs` 需要 `@modelcontextprotocol/sdk`，包里必须带 node_modules。
- Windows 上 spawn `.cmd` 会 EINVAL（shell:false + Node≥18），查找 opencode 时 `.exe` 优先（fork 提交 715b650）。
- 环境变量 `CHORUS_URL` 的优先级高于 daemon.json——安装脚本会把它同步成本次填的地址，
  否则用户早年 setx 的旧地址会静默劫持新配置（现象：`credentials resolved from: env` + `fetch failed`）。
- opencode 接平台用原生 remote MCP（`{env:CHORUS_API_KEY}` 模板），不装 opencode-chorus 插件——
  插件首启要联网拉 npm 包，内网机器装不上。
- 真实模型密钥**不入库**：payload-src 里 apiKey 是占位符 `sk-REPLACE-WITH-REAL-KEY`；内网分发前本地替换并 regen+build，产物 zip 不要回传进仓库。
