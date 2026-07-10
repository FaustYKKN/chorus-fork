// cli/daemon-console.mjs
// The daemon's LOCAL console: a loopback-only status + config page the daemon
// serves itself (default http://127.0.0.1:8638, see resolveConsoleConfig). It
// exists so an operator manages the machine-local half of the setup — the cwd
// whitelist (daemon.json `cwds`), restart/stop — from a browser instead of a
// terminal window. Platform-level concerns (skills, permissions, assignment)
// stay on the Chorus server; this page is deliberately machine-local (DEC-5:
// cwd ⟂ project — paths only mean something on this host).
//
// Security posture: binds 127.0.0.1 ONLY (never configurable to 0.0.0.0 here),
// no auth — same trust boundary as the local user account that owns the daemon
// and its yolo-mode agent. Plain ESM, zero dependencies — ships verbatim in the
// npm package.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { loginFilePath } from "./credentials.mjs";

/**
 * A bounded in-memory line buffer the daemon's logger tees into, so the console
 * can show a recent-log tail without touching the logfile (which only exists in
 * detached mode). Multi-line entries are split so the cap counts LINES.
 * @param {number} [capacity]
 */
export function createLogRing(capacity = 300) {
  /** @type {string[]} */
  const buf = [];
  return {
    push(entry) {
      for (const line of String(entry).split(/\r?\n/)) {
        buf.push(line);
        if (buf.length > capacity) buf.shift();
      }
    },
    lines() {
      return [...buf];
    },
  };
}

// Absolute-path shapes we accept for a served directory: POSIX (/…), Windows
// drive (C:\… or C:/…), UNC (\\host\…), or ~-prefixed (~/… — expanded by
// resolveDaemonCwds at daemon start). Relative paths are rejected: they would
// silently resolve against the DAEMON's process cwd, which is never what the
// operator picking a directory in a browser means.
const ABS_PATH_RE = /^(?:[A-Za-z]:[\\/]|\/|\\\\|~(?:[\\/]|$))/;

/**
 * Validate + clean a whitelist submission: strings only, trimmed, non-empty,
 * absolute-shaped, de-duplicated (first occurrence wins). An empty result is an
 * error — a daemon must serve at least one path.
 * @param {unknown} input
 * @returns {{ ok: true, cwds: string[], rejected: string[] } | { ok: false, error: string, rejected?: string[] }}
 */
export function sanitizeCwdList(input) {
  if (!Array.isArray(input)) return { ok: false, error: "cwds must be an array of paths" };
  const seen = new Set();
  const cwds = [];
  const rejected = [];
  for (const raw of input) {
    if (typeof raw !== "string") {
      rejected.push(String(raw));
      continue;
    }
    const t = raw.trim();
    if (!t) continue;
    if (!ABS_PATH_RE.test(t)) {
      rejected.push(t);
      continue;
    }
    if (seen.has(t)) continue;
    seen.add(t);
    cwds.push(t);
  }
  if (cwds.length === 0) {
    return { ok: false, error: "at least one valid absolute path is required", rejected };
  }
  return { ok: true, cwds, rejected };
}

/**
 * Read the CONFIGURED whitelist (daemon.json `cwds`) — the file the console
 * edits, as opposed to the LIVE served set (which may come from --cwd flags or
 * env until the next restart). `null` when the file has no usable `cwds`.
 * @param {{ loginPath?: string, readFileSync?: typeof readFileSync }} [deps]
 * @returns {string[] | null}
 */
export function readConfiguredCwds(deps = {}) {
  const loginPath = deps.loginPath ?? loginFilePath();
  const read = deps.readFileSync ?? readFileSync;
  try {
    const parsed = JSON.parse(read(loginPath, "utf8"));
    return Array.isArray(parsed?.cwds)
      ? parsed.cwds.filter((x) => typeof x === "string")
      : null;
  } catch {
    return null;
  }
}

/**
 * Persist a validated whitelist into daemon.json (read-modify-write, preserving
 * every other key) and best-effort create the directories so a freshly listed
 * path is servable on the next restart. `~`-prefixed entries are NOT created
 * here (they are expanded at daemon start); mkdir failures are reported, not
 * thrown — the config save itself already succeeded.
 * @param {string[]} cwds
 * @param {{
 *   loginPath?: string,
 *   readFileSync?: typeof readFileSync,
 *   writeFileSync?: typeof writeFileSync,
 *   mkdirSync?: typeof mkdirSync,
 * }} [deps]
 * @returns {{ ensured: string[], failed: Array<{path: string, error: string}> }}
 */
export function persistCwds(cwds, deps = {}) {
  const loginPath = deps.loginPath ?? loginFilePath();
  const read = deps.readFileSync ?? readFileSync;
  const write = deps.writeFileSync ?? writeFileSync;
  const mkdir = deps.mkdirSync ?? mkdirSync;

  let config = {};
  try {
    const parsed = JSON.parse(read(loginPath, "utf8"));
    if (parsed && typeof parsed === "object") config = parsed;
  } catch {
    // Missing/corrupt file: start fresh — the write below recreates it. (The
    // credentials live in the same file; a daemon that got this far resolved
    // them already, so a corrupt file here is best repaired by the operator —
    // we still only ADD the cwds key to whatever parsed.)
  }
  config.cwds = cwds;
  // 0600 like the login writer — the file also holds the API key.
  write(loginPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });

  const ensured = [];
  const failed = [];
  for (const dir of cwds) {
    if (dir.startsWith("~")) continue;
    try {
      mkdir(dir, { recursive: true });
      ensured.push(dir);
    } catch (e) {
      failed.push({ path: dir, error: String(e?.message ?? e) });
    }
  }
  return { ensured, failed };
}

/** Read a request body with a hard cap (the console only ever receives tiny JSON). */
function readBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
}

/**
 * Create (but do not yet bind) the console server.
 *
 * @param {{
 *   port: number,
 *   host?: string,
 *   getState: () => object,
 *   persist?: typeof persistCwds,
 *   onRestart?: () => (void | Promise<void>),
 *   onStop?: () => (void | Promise<void>),
 *   logger?: { info(m: string): void, warn(m: string): void },
 * }} opts
 * @returns {{ server: import("node:http").Server, start(): Promise<string|null>, stop(): void }}
 */
export function createDaemonConsole(opts) {
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port;
  const getState = opts.getState;
  const persist = opts.persist ?? persistCwds;
  const logger = opts.logger ?? { info() {}, warn() {} };

  async function route(req, res) {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      return sendHtml(res, PAGE_HTML);
    }
    if (req.method === "GET" && path === "/api/state") {
      return sendJson(res, 200, getState());
    }
    if (req.method === "POST" && path === "/api/cwds") {
      let parsed;
      try {
        parsed = JSON.parse((await readBody(req)) || "{}");
      } catch {
        return sendJson(res, 400, { error: "invalid JSON body" });
      }
      const check = sanitizeCwdList(parsed.cwds);
      if (!check.ok) return sendJson(res, 400, { error: check.error, rejected: check.rejected ?? [] });
      const result = persist(check.cwds);
      logger.info(`[Chorus] console: cwd whitelist saved (${check.cwds.length} paths)`);
      return sendJson(res, 200, { ok: true, cwds: check.cwds, rejected: check.rejected, ...result });
    }
    if (req.method === "POST" && (path === "/api/restart" || path === "/api/stop")) {
      const action = path === "/api/restart" ? opts.onRestart : opts.onStop;
      sendJson(res, 200, { ok: true });
      // Respond FIRST, then act — restart/stop may tear this very server down.
      setTimeout(() => {
        Promise.resolve(action?.()).catch((e) =>
          logger.warn(`[Chorus] console ${path} action failed: ${e}`)
        );
      }, 150);
      return;
    }
    return sendJson(res, 404, { error: "not found" });
  }

  const server = createServer((req, res) => {
    route(req, res).catch((err) => {
      try {
        sendJson(res, 500, { error: String(err?.message ?? err) });
      } catch {
        // response already gone — nothing to salvage
      }
    });
  });

  let settled = false;
  return {
    server,
    start() {
      return new Promise((resolve) => {
        server.on("error", (err) => {
          if (!settled) {
            settled = true;
            logger.warn(
              `[Chorus] local console failed to start on http://${host}:${port} (${err?.code ?? err}) — daemon continues without it`
            );
            resolve(null);
          } else {
            logger.warn(`[Chorus] local console error: ${err?.code ?? err}`);
          }
        });
        server.listen(port, host, () => {
          settled = true;
          resolve(`http://${host}:${port}`);
        });
      });
    },
    stop() {
      try {
        server.close();
      } catch {
        // already closed
      }
    },
  };
}

// ===== The page =====
// One self-contained document, Chinese UI, zero external assets (the daemon may
// sit on a machine with no internet). Keep plain string concatenation in the
// inline script — no template literals, so this outer literal stays simple.
const PAGE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chorus Daemon 本地控制台</title>
<style>
:root { --bg:#f5f4f0; --card:#fff; --ink:#333; --muted:#8a8378; --line:#e5e1d8; --accent:#b5651d; --ok:#2e7d32; --warn:#e65100; --err:#c62828; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#191817; --card:#232120; --ink:#e8e4dd; --muted:#9a938a; --line:#3a3733; --accent:#d98c4a; }
}
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.6 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; }
.wrap { max-width:900px; margin:0 auto; padding:20px 16px 60px; }
h1 { font-size:18px; margin:6px 0 2px; }
.sub { color:var(--muted); font-size:12px; margin-bottom:16px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin-bottom:14px; }
.card h2 { font-size:14px; margin:0 0 10px; }
.kv { display:grid; grid-template-columns:110px 1fr; gap:4px 10px; font-size:13px; }
.kv .k { color:var(--muted); }
.mono { font-family:ui-monospace,Consolas,monospace; font-size:12px; }
.chip { display:inline-block; padding:0 8px; border-radius:9px; font-size:12px; line-height:20px; }
.chip.ok { background:rgba(46,125,50,.12); color:var(--ok); }
.chip.warn { background:rgba(230,81,0,.12); color:var(--warn); }
.chip.off { background:rgba(128,128,128,.15); color:var(--muted); }
.row { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px dashed var(--line); }
.row:last-child { border-bottom:none; }
.row .path { flex:1; word-break:break-all; }
button { border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:7px; padding:5px 12px; cursor:pointer; font-size:13px; }
button:hover { border-color:var(--accent); color:var(--accent); }
button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
button.primary:hover { opacity:.9; color:#fff; }
button.danger:hover { border-color:var(--err); color:var(--err); }
button:disabled { opacity:.45; cursor:not-allowed; }
input[type=text] { flex:1; border:1px solid var(--line); background:var(--bg); color:var(--ink); border-radius:7px; padding:6px 10px; font-size:13px; }
pre { background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:10px; max-height:260px; overflow:auto; font-size:12px; white-space:pre-wrap; word-break:break-all; }
.banner { position:sticky; top:0; z-index:9; margin:0 -16px 12px; padding:8px 16px; background:var(--warn); color:#fff; font-size:13px; display:none; }
.hint { color:var(--muted); font-size:12px; }
.actions { display:flex; gap:10px; align-items:center; }
#overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); display:none; align-items:center; justify-content:center; color:#fff; font-size:15px; z-index:99; text-align:center; }
</style>
</head>
<body>
<div id="overlay"><div id="overlayText">处理中…</div></div>
<div class="wrap">
  <div id="offline" class="banner">⚠ 无法连接守护进程（可能已停止或正在重启）</div>
  <h1>Chorus Daemon 本地控制台</h1>
  <div class="sub" id="subtitle">加载中…</div>

  <div class="card">
    <h2>运行状态</h2>
    <div class="kv" id="statusKv"></div>
  </div>

  <div class="card">
    <h2>目录白名单 <span class="hint">（守护进程只在这些目录里开工；保存后需重启生效）</span></h2>
    <div id="cwdList"></div>
    <div class="row" style="border:none; padding-top:10px;">
      <input type="text" id="newCwd" placeholder="输入绝对路径，如 D:\\opencode-auto-work 或 /home/me/proj">
      <button id="addBtn">添加</button>
    </div>
    <div class="actions" style="margin-top:8px;">
      <button class="primary" id="saveBtn" disabled>保存并重启生效</button>
      <span class="hint" id="dirtyHint"></span>
    </div>
    <div class="hint" id="cwdSourceHint" style="margin-top:6px;"></div>
  </div>

  <div class="card">
    <h2>任务队列</h2>
    <div id="queueBox" class="mono"></div>
  </div>

  <div class="card">
    <h2>操作</h2>
    <div class="actions">
      <button id="restartBtn">重启守护进程</button>
      <button class="danger" id="stopBtn">停止守护进程</button>
      <span class="hint">重启用于让白名单等配置生效；停止后需在机器上重新启动</span>
    </div>
  </div>

  <div class="card">
    <h2>最近日志</h2>
    <pre id="logBox">（暂无）</pre>
  </div>
</div>
<script>
"use strict";
var state = null;
var editCwds = null;   // 编辑中的白名单（脏状态下不被轮询覆盖）
var dirty = false;

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
function el(id) { return document.getElementById(id); }

function connChip(conn) {
  if (!conn) return '<span class="chip off">待重启加入</span>';
  if (conn.skipped) return '<span class="chip warn">冲突已跳过</span>';
  if (conn.connectionUuid) return '<span class="chip ok">在线</span>';
  return '<span class="chip off">连接中…</span>';
}

function renderStatus(s) {
  el("subtitle").textContent = "智能体 " + s.agentName + " · 后端 " + s.agentType + " · v" + s.version;
  var mode = s.permissionMode === "yolo" ? "全自动（yolo）" : "仅 Chorus 工具";
  var run = s.detached ? "后台（-d）" : "前台";
  var online = (s.connections || []).filter(function (c) { return c.connectionUuid && !c.skipped; }).length;
  var kv = [
    ["平台地址", '<a href="' + esc(s.platformUrl) + '" target="_blank">' + esc(s.platformUrl) + "</a>"],
    ["智能体", esc(s.agentName) + ' <span class="mono">' + esc((s.agentUuid || "").slice(0, 8)) + "</span>"],
    ["连接", online + " / " + (s.connections || []).length + " 在线"],
    ["权限模式", esc(mode)],
    ["运行方式", esc(run)],
    ["唤醒并发", esc(String(s.wakeConcurrency)) + (s.wakeConcurrency === 1 ? "（全串行）" : "")],
    ["后端程序", '<span class="mono">' + esc(s.cliPath || "（未找到，请安装或设置 CHORUS_OPENCODE_PATH）") + "</span>"],
    ["配置文件", '<span class="mono">' + esc(s.configPath || "") + "</span>"],
    ["启动时间", esc(s.startedAt || "")]
  ];
  el("statusKv").innerHTML = kv.map(function (p) {
    return '<div class="k">' + p[0] + '</div><div>' + p[1] + "</div>";
  }).join("");
}

function currentList(s) {
  if (dirty && editCwds) return editCwds;
  var conf = s.configuredCwds;
  if (conf && conf.length) return conf.slice();
  return (s.connections || []).map(function (c) { return c.cwd; });
}

function renderCwds(s) {
  var list = currentList(s);
  if (!dirty) editCwds = list.slice();
  var byPath = {};
  (s.connections || []).forEach(function (c) { byPath[c.cwd] = c; });
  el("cwdList").innerHTML = list.map(function (p, i) {
    return '<div class="row"><span class="path mono">' + esc(p) + "</span>" +
      connChip(byPath[p]) +
      '<button data-i="' + i + '" class="rmBtn danger">删除</button></div>';
  }).join("") || '<div class="hint">（空）</div>';
  Array.prototype.forEach.call(document.querySelectorAll(".rmBtn"), function (b) {
    b.onclick = function () {
      editCwds.splice(Number(b.getAttribute("data-i")), 1);
      markDirty();
      renderCwds(state);
    };
  });
  var served = (s.connections || []).map(function (c) { return c.cwd; }).join("|");
  var conf = (s.configuredCwds || []).join("|");
  el("cwdSourceHint").textContent =
    s.configuredCwds && served !== conf
      ? "提示：当前运行中的目录与配置文件不一致（可能来自启动参数），重启后以此页保存的配置为准。"
      : "";
}

function markDirty() {
  dirty = true;
  el("saveBtn").disabled = false;
  el("dirtyHint").textContent = "有未保存的修改";
}

function renderQueue(s) {
  var q = s.queue || {};
  var lines = ["执行中 " + (q.active || 0) + " 个"];
  (q.running || []).forEach(function (k) { lines.push("  ▶ " + k); });
  if ((q.pending || []).length) {
    lines.push("排队 " + q.pending.length + " 个");
    q.pending.forEach(function (k) { lines.push("  … " + k); });
  }
  el("queueBox").textContent = lines.join("\\n");
}

function renderLog(s) {
  var box = el("logBox");
  var stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 20;
  box.textContent = (s.logTail || []).join("\\n") || "（暂无）";
  if (stick) box.scrollTop = box.scrollHeight;
}

function render() {
  if (!state) return;
  renderStatus(state);
  renderCwds(state);
  renderQueue(state);
  renderLog(state);
}

function refresh() {
  fetch("/api/state").then(function (r) { return r.json(); }).then(function (s) {
    state = s;
    el("offline").style.display = "none";
    render();
  }).catch(function () {
    el("offline").style.display = "block";
  });
}

function overlay(text) {
  el("overlayText").textContent = text;
  el("overlay").style.display = "flex";
}

function waitBack(tries) {
  if (tries <= 0) { overlay("等待超时——请在机器上确认守护进程状态"); return; }
  fetch("/api/state").then(function (r) {
    if (r.ok) { location.reload(); return; }
    throw new Error("not ready");
  }).catch(function () {
    setTimeout(function () { waitBack(tries - 1); }, 1500);
  });
}

el("addBtn").onclick = function () {
  var v = el("newCwd").value.trim();
  if (!v) return;
  if (editCwds.indexOf(v) !== -1) { el("newCwd").value = ""; return; }
  editCwds.push(v);
  el("newCwd").value = "";
  markDirty();
  renderCwds(state);
};
el("newCwd").addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.isComposing) el("addBtn").onclick();
});

el("saveBtn").onclick = function () {
  fetch("/api/cwds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwds: editCwds })
  }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
    .then(function (res) {
      if (!res.ok) { alert("保存失败：" + (res.j.error || "未知错误")); return; }
      if ((res.j.rejected || []).length) alert("以下条目不是绝对路径，已忽略：\\n" + res.j.rejected.join("\\n"));
      if ((res.j.failed || []).length) alert("以下目录创建失败（请检查权限）：\\n" + res.j.failed.map(function (f) { return f.path + "：" + f.error; }).join("\\n"));
      dirty = false;
      el("saveBtn").disabled = true;
      el("dirtyHint").textContent = "";
      overlay("配置已保存，正在重启守护进程…");
      fetch("/api/restart", { method: "POST" }).finally(function () {
        setTimeout(function () { waitBack(40); }, 2500);
      });
    })
    .catch(function (e) { alert("保存失败：" + e); });
};

el("restartBtn").onclick = function () {
  if (!confirm("确认重启守护进程？运行中的任务会被打断并按平台机制恢复。")) return;
  overlay("正在重启守护进程…");
  fetch("/api/restart", { method: "POST" }).finally(function () {
    setTimeout(function () { waitBack(40); }, 2500);
  });
};
el("stopBtn").onclick = function () {
  if (!confirm("确认停止守护进程？停止后此页面将不可用，需在机器上重新启动。")) return;
  overlay("已发送停止指令。守护进程停止后此页面即失效。");
  fetch("/api/stop", { method: "POST" });
};

refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>
`;
