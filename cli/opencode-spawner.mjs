// cli/opencode-spawner.mjs
// Cross-platform headless opencode spawner — the `opencode` counterpart to
// ClaudeSpawner/CodexSpawner, satisfying the SAME backend-agnostic
// Spawner.wake(...) contract so the daemon's wake pipeline (queue, waker,
// directed delivery, headless guard, reporters) stays backend-neutral.
//
// opencode diverges structurally from Claude (verified against opencode 1.17.13
// + a live `opencode run --format json` run):
//   • `opencode run --format json` emits JSONL (one event per line); the prompt
//     is read from STDIN when no positional message is given (never argv here).
//     `opencode run --session <ses_…> --format json` continues a session.
//   • Every event carries a top-level `sessionID` (`ses_…`) — opencode GENERATES
//     its own id (it does NOT accept a client-supplied one for a NEW session).
//     We capture it and persist anchor→sessionID (opencode-session-map.mjs) so a
//     later wake can `--session <id>` resume. Same model as Codex.
//   • Assistant text rides on `{"type":"text", "part":{type:"text", text}}`
//     events — one event per COMPLETED part (verified: no incremental repeats).
//     We translate each into the codex `item.completed`/`agent_message` dialect
//     before onMessage, so upload-hooks' extractTranscriptText keeps it without
//     needing a third dialect there.
//   • No `--mcp-config`: Chorus tools come from the user's opencode-chorus
//     plugin (~/.config/opencode), which resolves credentials env-first — the
//     daemon key/url reach it via CHORUS_API_KEY / CHORUS_BASE_URL in the child
//     ENV (never argv), so the woken opencode acts under the DAEMON's identity
//     even when chorus.json holds a different key.
//   • Permission is opencode's allow/deny config: yolo → `--auto`
//     (auto-approve anything not explicitly denied); chorus (restricted) → no
//     flag, so a headless run can only use what the user's config pre-allows.
//
// Reuses claude-spawner's parseNdjsonChunk and codex-spawner's
// resolveSpawnCommand (platform-neutral helpers).

import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { win32 as pathWin32, posix as pathPosix } from "node:path";
import { parseNdjsonChunk } from "./claude-spawner.mjs";
import { resolveSpawnCommand } from "./codex-spawner.mjs";
import { killProcessTree } from "./process-killer.mjs";
import {
  getSessionId as defaultGetSessionId,
  setSessionId as defaultSetSessionId,
} from "./opencode-session-map.mjs";

const NOOP_LOGGER = { info() {}, warn() {}, error() {} };

/** Parse a non-negative millisecond value from env, else the default. 0 disables the gate. */
function envMs(name, def) {
  const raw = process.env[name];
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
}

/**
 * Map the daemon's backend-agnostic permission mode to opencode flags.
 *   yolo   → --auto  (auto-approve permissions not explicitly denied — full
 *            autonomy, opencode's closest analogue to
 *            --dangerously-skip-permissions)
 *   chorus → no flag (headless permission asks fail closed; only what the
 *            user's opencode config explicitly allows can run)
 * @param {"yolo"|"chorus"|undefined} permissionMode
 * @returns {string[]}
 */
export function permissionFlags(permissionMode) {
  return permissionMode === "yolo" ? ["--auto"] : [];
}

/**
 * Build the argv for a headless opencode run. Prompt is NEVER here — it goes
 * over stdin. CHORUS_OPENCODE_MODEL optionally pins a model (provider/model),
 * otherwise the user's opencode config default applies.
 * @param {{ isNew: boolean, opencodeSessionId?: string|null,
 *           permissionMode?: "yolo"|"chorus", model?: string|null }} o
 * @returns {string[]}
 */
export function buildOpencodeArgs({ isNew, opencodeSessionId, permissionMode, model }) {
  const args = ["run", "--format", "json", ...permissionFlags(permissionMode)];
  if (!isNew && opencodeSessionId) args.push("--session", opencodeSessionId);
  if (model) args.push("--model", model);
  return args;
}

/**
 * Extract the opencode session id from a stream event, or null. Every opencode
 * JSONL event carries a top-level `sessionID` (verified against 1.17.13).
 * @param {any} obj
 * @returns {string|null}
 */
export function extractSessionId(obj) {
  if (!obj || typeof obj !== "object") return null;
  return typeof obj.sessionID === "string" && obj.sessionID.length > 0 ? obj.sessionID : null;
}

/**
 * Translate one opencode stream event into the codex transcript dialect that
 * upload-hooks' extractTranscriptText already recognizes
 * (`{type:"item.completed", item:{type:"agent_message", text}}`), or null when
 * the event carries no assistant conversation text. Only COMPLETED `text` parts
 * qualify — tool/step/lifecycle events are not conversation text.
 * @param {any} obj  One parsed opencode NDJSON event.
 * @returns {{ type: "item.completed", item: { type: "agent_message", text: string } } | null}
 */
export function toTranscriptEvent(obj) {
  if (!obj || typeof obj !== "object" || obj.type !== "text") return null;
  const part = obj.part;
  if (!part || typeof part !== "object" || part.type !== "text") return null;
  const text = typeof part.text === "string" ? part.text : "";
  if (!text.trim()) return null;
  return { type: "item.completed", item: { type: "agent_message", text } };
}

/**
 * Resolve the real `opencode` executable WITHOUT a shell — same PATH-walk shape
 * as resolveClaudePath/resolveCodexPath. `CHORUS_OPENCODE_PATH` overrides.
 * @param {{ env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, isFile?: (p: string) => boolean }} [deps]
 * @returns {string | null}
 */
export function resolveOpencodePath(deps = {}) {
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  const isFile =
    deps.isFile ??
    ((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });

  if (env.CHORUS_OPENCODE_PATH && isFile(env.CHORUS_OPENCODE_PATH)) {
    return env.CHORUS_OPENCODE_PATH;
  }

  const isWin = platform === "win32";
  const p = isWin ? pathWin32 : pathPosix;
  // .exe FIRST: the spawner uses shell:false, and Node ≥18 refuses to spawn
  // .cmd/.bat shims without a shell (EINVAL) — a real exe always spawns.
  const names = isWin ? ["opencode.exe", "opencode.cmd", "opencode"] : ["opencode"];
  const pathVar = env.PATH || env.Path || "";
  const dirs = pathVar.split(p.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = p.join(dir, name);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * @typedef {Object} OpencodeSpawnerOptions
 * @property {string} [opencodePath]   Resolved opencode path (resolved lazily if omitted).
 * @property {(o: object) => any} [spawnImpl]   Injectable spawn (tests).
 * @property {{info(m:string):void,warn(m:string):void,error(m:string):void}} [logger]
 * @property {"chorus"|"yolo"} [permissionMode]  Maps to --auto (yolo) or nothing.
 * @property {{ url: string, apiKey: string }} [creds]  Daemon creds — exported into the
 *   child env as CHORUS_API_KEY + CHORUS_BASE_URL for the opencode-chorus plugin
 *   (env beats its chorus.json, so the wake runs under the daemon's identity).
 * @property {NodeJS.Platform} [platform]  Injectable for tests; gates POSIX `detached`.
 * @property {(anchor: string) => string|null} [getSessionIdFn]  Injectable session-map read.
 * @property {(anchor: string, sessionId: string) => void} [setSessionIdFn]  Injectable session-map write.
 */

export class OpencodeSpawner {
  /** @param {OpencodeSpawnerOptions} [opts] */
  constructor(opts = {}) {
    this.opencodePath = opts.opencodePath ?? null;
    this.spawnImpl = opts.spawnImpl ?? spawn;
    this.logger = opts.logger ?? NOOP_LOGGER;
    this.permissionMode = opts.permissionMode ?? "chorus";
    this.creds = opts.creds ?? null;
    this.platform = opts.platform ?? process.platform;
    this.getSessionIdFn = opts.getSessionIdFn ?? defaultGetSessionId;
    this.setSessionIdFn = opts.setSessionIdFn ?? defaultSetSessionId;
    this.resolveOpencodePathFn = opts.resolveOpencodePathFn ?? resolveOpencodePath;
    // R5 (unattended-batch SPEC) — runaway guard. `idleTimeoutMs`: kill a wake
    // whose opencode output has been SILENT this long (the shared symptom of an
    // LLM 429/500 hang or a memory thrash — caught in minutes, not the ceiling).
    // `maxMs`: absolute per-wake wall-clock ceiling. 0 disables either gate.
    // `checkIntervalMs`: how often the monitor polls (also the min kill latency).
    this.idleTimeoutMs = opts.idleTimeoutMs ?? envMs("CHORUS_WAKE_IDLE_TIMEOUT_MS", 12 * 60 * 1000);
    this.maxMs = opts.maxMs ?? envMs("CHORUS_WAKE_MAX_MS", 90 * 60 * 1000);
    this.checkIntervalMs = opts.checkIntervalMs ?? 15 * 1000;
    // Cross-platform process-TREE killer for the runaway guard (injectable for
    // tests; defaults to the shared killer the interrupt path uses).
    this.killer = opts.killer ?? killProcessTree;
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Spawn a headless opencode run. Resolves when the subprocess exits. The
   * prompt is written to stdin (never argv). `sessionId` is the Chorus anchor
   * (direct idea uuid, or entity uuid). opencode owns its session id, so we
   * IGNORE the passed `isNew`/`mcpConfigPath` and decide new-vs-resume from the
   * persisted anchor→sessionID map — same backend-owned model as Codex.
   *
   * @param {{ prompt: string, sessionId: string|null, isNew?: boolean, mcpConfigPath?: string,
   *           cwd?: string, onMessage?: (obj: any) => void,
   *           onChild?: (child: import("node:child_process").ChildProcess) => void }} params
   * @returns {Promise<{ sessionId: string, exitCode: number|null, isNew: boolean }>}
   */
  async wake({ prompt, sessionId, cwd, instanceUuid, onMessage, onChild }) {
    const anchor = typeof sessionId === "string" ? sessionId : "";

    const knownSessionId = anchor ? this.getSessionIdFn(anchor) : null;
    const isNew = !knownSessionId;

    const opencodePath = this.opencodePath ?? this.resolveOpencodePathFn();
    if (!opencodePath) {
      this.logger.error("[Chorus] cannot locate the `opencode` executable on PATH; skipping wake");
      return { sessionId: anchor, exitCode: null, isNew };
    }

    const args = buildOpencodeArgs({
      isNew,
      opencodeSessionId: knownSessionId,
      permissionMode: this.permissionMode,
      model: process.env.CHORUS_OPENCODE_MODEL || null,
    });
    const { command, argv } = resolveSpawnCommand(opencodePath, args, this.platform);

    // POSIX: detached process group so the interrupt path can group-kill the tree
    // (opencode forks child shells for tools). Windows uses taskkill /T.
    const detached = this.platform !== "win32";

    // Daemon identity via ENV — the opencode-chorus plugin resolves env over its
    // chorus.json (CHORUS_BASE_URL first, then CHORUS_URL). NEVER argv.
    // PWD must be pinned to the spawn cwd: opencode trusts the $PWD logical path
    // over getcwd() when binding the session's project directory, and the daemon's
    // inherited PWD (its own start shell) would silently relocate the session
    // (verified against opencode 1.17.13: cwd=A + PWD=B → session created in B).
    const resolvedCwd = cwd ?? process.cwd();
    const childEnv = { ...process.env, CHORUS_DAEMON_HEADLESS: "1", PWD: resolvedCwd };
    if (this.creds && this.creds.apiKey) {
      childEnv.CHORUS_API_KEY = this.creds.apiKey;
      if (this.creds.url) childEnv.CHORUS_BASE_URL = this.creds.url;
    }
    // Instance identity for pinned-task affinity: the plugin forwards this as an
    // X-Chorus-Instance header, and the server rejects claims on tasks pinned to
    // a DIFFERENT instance (fix for "task pinned to directory A executed by the
    // session woken in directory B").
    if (typeof instanceUuid === "string" && instanceUuid) {
      childEnv.CHORUS_INSTANCE_UUID = instanceUuid;
    }

    return new Promise((resolve) => {
      let child;
      try {
        child = this.spawnImpl(command, argv, {
          cwd: resolvedCwd,
          stdio: ["pipe", "pipe", "pipe"],
          env: childEnv,
          shell: false,
          detached,
          windowsHide: true,
        });
      } catch (err) {
        this.logger.error(`[Chorus] failed to spawn opencode: ${err}`);
        resolve({ sessionId: anchor, exitCode: null, isNew });
        return;
      }

      if (onChild) {
        try {
          onChild(child);
        } catch (err) {
          this.logger.warn(`[Chorus] onChild handler threw: ${err}`);
        }
      }

      // R5 runaway guard — kill a wake that goes SILENT for idleTimeoutMs (429/500
      // hang / memory thrash) or runs past maxMs. `lastOutput` is bumped by every
      // stdout/stderr chunk below, so a busy wake resets the idle clock; a hung one
      // does not. `timedOut` is threaded back so the waker reports interrupted
      // (reason "timed_out") and the server flags the task (R4/R5).
      const wakeStart = this.now();
      let lastOutput = wakeStart;
      let timedOut = false;
      const monitor = setInterval(() => {
        const now = this.now();
        const idle = this.idleTimeoutMs > 0 && now - lastOutput > this.idleTimeoutMs;
        const over = this.maxMs > 0 && now - wakeStart > this.maxMs;
        if (idle || over) {
          timedOut = true;
          // Fire ONCE: stop the monitor before killing so it can't re-log +
          // re-kill every checkInterval while the tree tears down (that was the
          // "over Xs budget" spam). child.on("close") clears it again — a
          // harmless double-clear.
          clearInterval(monitor);
          this.logger.warn(
            `[Chorus] killing opencode wake — ${idle ? `no output for ${Math.round((now - lastOutput) / 1000)}s (idle)` : `over ${Math.round((now - wakeStart) / 1000)}s budget`}`,
          );
          // Kill the whole PROCESS GROUP/TREE, not just the group leader. opencode
          // runs detached and forks child shells; child.kill() reaps only the
          // leader, so a grandchild holding the stdout pipe keeps `close` from
          // firing — the wake never reports interrupted, the task stays
          // in_progress and its lane (and the queue behind it) wedges. Reuse the
          // cross-platform tree killer the interrupt path uses (POSIX negative-pid
          // group signal / Windows taskkill /T /F).
          Promise.resolve(
            this.killer(child, { platform: this.platform, logger: this.logger }),
          ).catch((err) => this.logger.warn(`[Chorus] runaway killProcessTree rejected: ${err}`));
        }
      }, this.checkIntervalMs);
      if (typeof monitor.unref === "function") monitor.unref();

      let stdoutBuf = "";
      let observedSessionId = knownSessionId || null;

      child.stdout?.setEncoding?.("utf8");
      child.stdout?.on("data", (chunk) => {
        lastOutput = this.now(); // R5: progress signal — resets the idle clock
        stdoutBuf = parseNdjsonChunk(
          stdoutBuf,
          String(chunk),
          (obj) => {
            const sid = extractSessionId(obj);
            if (sid) observedSessionId = sid;
            if (onMessage) {
              // Only translated conversation text reaches onMessage: raw opencode
              // events match neither transcript dialect (harmless but noise), and
              // they carry no `session_id`, so the waker's anchor stays authoritative.
              const transcriptEvent = toTranscriptEvent(obj);
              if (transcriptEvent) {
                try {
                  onMessage(transcriptEvent);
                } catch (err) {
                  this.logger.warn(`[Chorus] onMessage handler threw: ${err}`);
                }
              }
            }
          },
          (msg) => this.logger.warn(`[Chorus] ${msg}`)
        );
      });

      child.stderr?.setEncoding?.("utf8");
      child.stderr?.on("data", (chunk) => {
        lastOutput = this.now(); // R5: stderr counts as progress too
        const text = String(chunk).trim();
        if (text) this.logger.warn(`[Chorus] opencode stderr: ${text}`);
      });

      child.on("error", (err) => {
        clearInterval(monitor);
        this.logger.error(`[Chorus] opencode process error: ${err}`);
        resolve({ sessionId: observedSessionId || anchor, exitCode: null, isNew, timedOut });
      });

      child.on("close", (code) => {
        clearInterval(monitor);
        if (code !== 0) {
          this.logger.warn(`[Chorus] opencode exited with code ${code}`);
        }
        // Persist anchor→sessionID only on a fresh, successful run that produced
        // a new id — so a later wake for this anchor resumes it. Best-effort.
        if (code === 0 && isNew && anchor && observedSessionId) {
          this.setSessionIdFn(anchor, observedSessionId);
        }
        resolve({ sessionId: observedSessionId || anchor, exitCode: code, isNew, timedOut });
      });

      child.stdin?.on?.("error", (err) => {
        this.logger.warn(`[Chorus] opencode stdin error (ignored): ${err}`);
      });

      try {
        child.stdin?.write(prompt);
        child.stdin?.end();
      } catch (err) {
        this.logger.warn(`[Chorus] failed writing prompt to opencode stdin: ${err}`);
      }
    });
  }
}
