// 安装时的 daemon.json 合并：唤醒并发=1（同目录任务串行防冲突）+ 默认工作目录白名单。
// 用法: node configure-daemon.cjs <默认工作目录>
// 幂等：已有 cwds 白名单时不覆盖（以用户在本地控制台里的配置为准）。
const fs = require("fs");
const path = require("path");
const os = require("os");

const p = path.join(os.homedir(), ".chorus", "daemon.json");
const defaultDir = process.argv[2];

try {
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  if (j.wakeConcurrency === undefined) j.wakeConcurrency = 1;
  if (!Array.isArray(j.cwds) || j.cwds.length === 0) {
    if (defaultDir) {
      j.cwds = [defaultDir];
      try {
        fs.mkdirSync(defaultDir, { recursive: true });
        console.log("默认工作目录已创建并加入白名单: " + defaultDir);
      } catch (e) {
        console.log("[警告] 目录创建失败（" + e.message + "），白名单仍已写入，可稍后在控制台修改");
      }
    }
  } else {
    console.log("已存在目录白名单，保持不变: " + j.cwds.join(", "));
  }
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n", { mode: 0o600 });
  console.log("wakeConcurrency=" + j.wakeConcurrency + " 已确认（1=任务串行执行）");
} catch (e) {
  console.log("[警告] 未能更新 " + p + "（" + e.message + "）— 请先完成登录步骤");
}
