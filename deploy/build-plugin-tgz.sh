#!/usr/bin/env bash
# 从本 fork 的当前 HEAD 重新构建并「上架」对外发布的 opencode-chorus 插件包
# public/opencode-chorus-<版本>.tgz —— 让内网机器装到的内嵌 daemon 与本 checkout
# 的 daemon 代码一致（含 Layer 1 按目录串行、unattended-batch 空转/硬顶守卫等）。
#
# 为什么需要它：插件包里 vendor 了一份 daemon bundle（daemon/chorus-daemon.mjs，
# 由插件仓 scripts/sync-daemon.mjs 用 esbuild 从本 fork 的 chorus.mjs 单文件打包）。
# daemon 侧每改一次，这份 bundle 就旧一次；不重打包，别人 `npx <tgz> setup` 装到的
# 还是老 daemon。本机 systemd daemon 直跑 fork cli/，不吃这个 tgz——所以这一步只在
# 「往开发机群铺开」时才需要跑。
#
# 关键坑（务必理解）：sync-daemon 打包的是 fork【工作树】的 chorus.mjs，但 VERSION.json
# 记的是【git HEAD】短哈希。工作树脏 => 打进去的是未提交代码、却盖了 HEAD 的戳（骗人的
# 版本号）。所以本脚本强制 fork 工作树干净，并在打包后校验 bundle 的 forkCommit == HEAD，
# 对不上直接中止。
#
# 依赖：node / npm / npx（esbuild 走 npx -y esbuild@<pinned>，无需预装）；插件仓需能
# 跑 `npm pack`（prepack=bun run clean && build，故需 bun）。无需先构建服务端。
# 用法：
#   deploy/build-plugin-tgz.sh [插件仓目录]        # 目录默认同级 ../opencode-chorus
#   PLUGIN_DIR=/path/to/opencode-chorus deploy/build-plugin-tgz.sh
#
# 产物：public/opencode-chorus-<版本>.tgz（覆盖）。脚本【不】自动 git commit——
# 二进制产物请人工 review 后再提交（版本号变了还要同步引导页常量，见末尾提示）。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
FORK="$(cd "$HERE/.." && pwd)"                       # 本脚本在 deploy/，上一级即 fork 根
PLUGIN="$(cd "${1:-${PLUGIN_DIR:-$FORK/../opencode-chorus}}" 2>/dev/null && pwd || true)"
GUIDE="$FORK/src/components/install-guide/AgentInstallGuide.tsx"

# 1. 前置检查
[ -f "$FORK/chorus.mjs" ] || { echo "!! 不是 chorus-fork checkout：缺 $FORK/chorus.mjs" >&2; exit 1; }
{ [ -n "$PLUGIN" ] && [ -f "$PLUGIN/scripts/sync-daemon.mjs" ]; } || {
  echo "!! 找不到插件仓（缺 scripts/sync-daemon.mjs）。作为参数或 \$PLUGIN_DIR 传入。" >&2
  echo "   期望默认位置：$FORK/../opencode-chorus" >&2
  exit 1
}

# 2. 强制 fork 工作树干净（否则 VERSION.json 的 HEAD 戳会骗人，见顶部「关键坑」）
if [ -n "$(git -C "$FORK" status --porcelain)" ]; then
  echo "!! chorus-fork 工作树有未提交改动 —— 先 commit/stash 再打包。" >&2
  echo "   （sync-daemon 打包工作树、却盖 HEAD 哈希；脏树 = 发布了未提交代码却标错版本）" >&2
  exit 1
fi
HEAD="$(git -C "$FORK" rev-parse --short HEAD)"
echo "fork      : $FORK"
echo "plugin    : $PLUGIN"
echo "fork HEAD : $HEAD（工作树干净）"

# 3. 从本 fork 把 daemon 打包进插件仓 daemon/（顺带 --help 冒烟）
echo ">> sync:daemon（把 $HEAD 的 daemon bundle 进插件）…"
CHORUS_FORK_DIR="$FORK" node "$PLUGIN/scripts/sync-daemon.mjs"

# 4. 打包插件。npm pack 触发 prepack=clean+build；按 package.json files 打入
#    dist + bin + daemon + skills + prompts。clean 只删 dist/，刚同步的 daemon/ 不受影响。
VER="$(node -p "require('$PLUGIN/package.json').version")"
TGZ="opencode-chorus-${VER}.tgz"
echo ">> npm pack（版本 $VER）…"
( cd "$PLUGIN" && npm pack >/dev/null )
[ -f "$PLUGIN/$TGZ" ] || { echo "!! 没生成 $TGZ" >&2; exit 1; }

# 5. 校验 bundle 确实来自 HEAD，再「上架」到 public/
BUNDLED="$(node -p "require('$PLUGIN/daemon/VERSION.json').forkCommit")"
if [ "$BUNDLED" != "$HEAD" ]; then
  echo "!! bundle 的 forkCommit（$BUNDLED）≠ fork HEAD（$HEAD），中止" >&2
  rm -f "$PLUGIN/$TGZ"
  exit 1
fi
mv -f "$PLUGIN/$TGZ" "$FORK/public/$TGZ"
echo ">> 已上架 public/$TGZ"
node -e "console.log('   VERSION.json =', JSON.stringify(require('$PLUGIN/daemon/VERSION.json')))"

# 6. 文件名漂移检查：装机引导页写死的常量必须与产物同名，否则页面发的是旧文件
SERVED="$(grep -oP 'OPENCODE_PLUGIN_TGZ = "\K[^"]+' "$GUIDE" 2>/dev/null || true)"
if [ -n "$SERVED" ] && [ "$SERVED" != "$TGZ" ]; then
  echo "!! 版本漂移：引导页发布的是 '$SERVED'，本次构建是 '$TGZ'。" >&2
  echo "   需改 src/components/install-guide/AgentInstallGuide.tsx 里 OPENCODE_PLUGIN_TGZ，" >&2
  echo "   并删掉旧的 public/$SERVED。" >&2
fi

echo "✅ 完成。请人工 review 后提交：git -C \"$FORK\" add public/$TGZ && git commit"
echo "   注：插件仓 $PLUGIN 的 daemon/（+dist/）也被重新生成了，"
echo "   若要保持插件仓自身一致，可在该仓一并提交 daemon/ 产物。"
