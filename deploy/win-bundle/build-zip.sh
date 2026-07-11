#!/usr/bin/env bash
# 从本 fork 构建 Windows 接入包 chorus-opencode-win64.zip。
# 产物内容：精简 daemon（无服务端构建产物）+ 内置 cli 运行时依赖 + 中文名 bat + 使用说明。
# 依赖：node / npm / zip；无需先 pnpm build（--ignore-scripts 跳过 prepack 重构建）。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${1:-$REPO/chorus-opencode-win64.zip}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# 1. npm 打包并抽出 daemon 所需文件（服务端的 .next/prisma 不进包——此包只跑 daemon）
cd "$REPO"
npm pack --ignore-scripts --pack-destination "$STAGE" >/dev/null 2>&1
mkdir -p "$STAGE/root/chorus-opencode-win64"
tar xzf "$STAGE"/chorus-aidlc-chorus-*.tgz -C "$STAGE/root/chorus-opencode-win64"
mv "$STAGE/root/chorus-opencode-win64/package" "$STAGE/root/chorus-opencode-win64/chorus"
rm -rf "$STAGE/root/chorus-opencode-win64/chorus/.next" \
       "$STAGE/root/chorus-opencode-win64/chorus/prisma" \
       "$STAGE/root/chorus-opencode-win64/chorus/prisma.config.ts"

# 2. 内置 cli 的运行时依赖。cli 并非零依赖：chorus-client.mjs 需要
#    @modelcontextprotocol/sdk（纯 JS，跨平台）；漏掉它 login/daemon 会报
#    ERR_MODULE_NOT_FOUND（2026-07-10 在目标机上实际踩过）。
VER="$(node -e "console.log(require('$REPO/package.json').dependencies['@modelcontextprotocol/sdk'])")"
mkdir "$STAGE/deps" && cd "$STAGE/deps"
printf '{"name":"stage","private":true}' > package.json
npm install --omit=dev --ignore-scripts --no-audit --no-fund "@modelcontextprotocol/sdk@$VER" >/dev/null
if find node_modules \( -name '*.node' -o -name 'binding.gyp' \) | grep -q .; then
  echo "依赖树混入原生二进制，不再跨平台——中止" >&2
  exit 1
fi
mv node_modules "$STAGE/root/chorus-opencode-win64/chorus/node_modules"

# 3. bat / 工具 / 说明（bat 内嵌 payload 见 payload-src/ 与 regen-payload.sh）
cp "$HERE"/*.bat "$HERE/使用说明.txt" "$STAGE/root/chorus-opencode-win64/"
mkdir -p "$STAGE/root/chorus-opencode-win64/tools"
cp "$HERE/tools/configure-daemon.cjs" "$STAGE/root/chorus-opencode-win64/tools/"

# 4. 冒烟：包内 CLI 必须只靠包内 node_modules 就能完成 login/daemon 的导入链
node --input-type=module -e "await import('$STAGE/root/chorus-opencode-win64/chorus/cli/chorus-client.mjs')" \
  && echo "冒烟：chorus-client 导入链 OK（依赖自洽）"

# 5. 打 zip
cd "$STAGE/root" && rm -f "$OUT" && zip -qr "$OUT" chorus-opencode-win64
echo "→ $OUT ($(du -h "$OUT" | cut -f1))"
