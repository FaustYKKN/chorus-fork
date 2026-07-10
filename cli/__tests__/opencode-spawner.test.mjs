// cli/__tests__/opencode-spawner.test.mjs
// Covers the opencode daemon backend: headless `opencode run --format json` wake
// (prompt on stdin), buildArgs for new vs resume + permission flag, sessionID
// capture from stream events + persistence, daemon-key-via-env (CHORUS_API_KEY +
// CHORUS_BASE_URL for the opencode-chorus plugin), transcript-event translation
// into the codex dialect, and never-throw-into-the-wake-path failure handling.
//
// Verified against opencode 1.17.13: every JSONL event carries a top-level
// `sessionID` (`ses_…`), the prompt is read from stdin when no positional
// message is given, and assistant text arrives as one `{"type":"text"}` event
// per COMPLETED part (no incremental repeats).
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  OpencodeSpawner,
  buildOpencodeArgs,
  permissionFlags,
  resolveOpencodePath,
  extractSessionId,
  toTranscriptEvent,
} from "../opencode-spawner.mjs";

const ANCHOR = "11111111-1111-4111-8111-111111111111";
const SID = "ses_0c548c6ffffeOwQx1Ow8aZf4f8";

/** A fake child process: stdin captures writes; stdout/stderr are emitters. */
function makeFakeChild() {
  const child = new EventEmitter();
  const stdinChunks = [];
  const stdin = new EventEmitter();
  stdin.writes = stdinChunks;
  stdin.write = (c) => stdinChunks.push(String(c));
  stdin.end = vi.fn();
  child.stdin = stdin;
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr = new EventEmitter();
  child.stderr.setEncoding = () => {};
  child.pid = 4242;
  return child;
}

describe("permissionFlags — permission mode mapping", () => {
  it("yolo → --auto (auto-approve anything not explicitly denied)", () => {
    expect(permissionFlags("yolo")).toEqual(["--auto"]);
  });
  it("chorus → no flag (headless asks fail closed; only pre-allowed tools run)", () => {
    expect(permissionFlags("chorus")).toEqual([]);
  });
  it("defaults unknown/undefined to the restricted posture", () => {
    expect(permissionFlags(undefined)).toEqual([]);
  });
});

describe("buildOpencodeArgs — new vs resume", () => {
  it("new run: run --format json + permission flag, no --session, no prompt in argv", () => {
    const args = buildOpencodeArgs({ isNew: true, permissionMode: "yolo" });
    expect(args).toEqual(["run", "--format", "json", "--auto"]);
    expect(args).not.toContain("--session");
  });

  it("resume run: run --format json --session <ses_…>", () => {
    const args = buildOpencodeArgs({ isNew: false, opencodeSessionId: SID, permissionMode: "yolo" });
    expect(args).toEqual(["run", "--format", "json", "--auto", "--session", SID]);
  });

  it("chorus mode omits --auto on new and resume", () => {
    expect(buildOpencodeArgs({ isNew: true, permissionMode: "chorus" })).toEqual(["run", "--format", "json"]);
    expect(buildOpencodeArgs({ isNew: false, opencodeSessionId: SID, permissionMode: "chorus" })).not.toContain(
      "--auto"
    );
  });

  it("pins a model when one is supplied (CHORUS_OPENCODE_MODEL)", () => {
    const args = buildOpencodeArgs({ isNew: true, permissionMode: "yolo", model: "deepseek/deepseek-v4-pro" });
    expect(args).toContain("--model");
    expect(args).toContain("deepseek/deepseek-v4-pro");
  });

  it("never contains the prompt (prompt is stdin-only)", () => {
    const args = buildOpencodeArgs({ isNew: true, permissionMode: "yolo" });
    expect(args.join(" ")).not.toContain("PROMPT");
  });
});

describe("extractSessionId — capture from any stream event", () => {
  it("reads the top-level sessionID", () => {
    expect(extractSessionId({ type: "step_start", sessionID: SID })).toBe(SID);
    expect(extractSessionId({ type: "text", sessionID: SID, part: {} })).toBe(SID);
  });
  it("returns null for events without one", () => {
    expect(extractSessionId({ type: "text" })).toBeNull();
    expect(extractSessionId({ sessionID: "" })).toBeNull();
    expect(extractSessionId(null)).toBeNull();
  });
});

describe("toTranscriptEvent — translation into the codex dialect", () => {
  it("translates a completed text part into item.completed/agent_message", () => {
    const got = toTranscriptEvent({ type: "text", sessionID: SID, part: { type: "text", text: "你好" } });
    expect(got).toEqual({ type: "item.completed", item: { type: "agent_message", text: "你好" } });
  });
  it("drops non-text and lifecycle events", () => {
    expect(toTranscriptEvent({ type: "step_start", sessionID: SID, part: { type: "step-start" } })).toBeNull();
    expect(toTranscriptEvent({ type: "step_finish", sessionID: SID, part: { type: "step-finish" } })).toBeNull();
    expect(toTranscriptEvent({ type: "tool", sessionID: SID, part: { type: "tool" } })).toBeNull();
    expect(toTranscriptEvent(null)).toBeNull();
  });
  it("drops empty/whitespace-only text parts", () => {
    expect(toTranscriptEvent({ type: "text", part: { type: "text", text: "  " } })).toBeNull();
    expect(toTranscriptEvent({ type: "text", part: { type: "text" } })).toBeNull();
  });
});

describe("resolveOpencodePath", () => {
  const isFile = (set) => (p) => set.has(p);

  it("honors CHORUS_OPENCODE_PATH override when it is a file", () => {
    const env = { CHORUS_OPENCODE_PATH: "/opt/opencode", PATH: "/usr/bin" };
    expect(resolveOpencodePath({ env, platform: "linux", isFile: isFile(new Set(["/opt/opencode"])) })).toBe(
      "/opt/opencode"
    );
  });

  it("walks PATH for `opencode` on POSIX", () => {
    const env = { PATH: "/a:/b" };
    expect(resolveOpencodePath({ env, platform: "linux", isFile: isFile(new Set(["/b/opencode"])) })).toBe(
      "/b/opencode"
    );
  });

  it("prefers opencode.exe over the .cmd shim on Windows (shell:false cannot spawn .cmd)", () => {
    const env = { Path: "C:\\bin" };
    const both = new Set(["C:\\bin\\opencode.exe", "C:\\bin\\opencode.cmd"]);
    expect(resolveOpencodePath({ env, platform: "win32", isFile: isFile(both) })).toBe("C:\\bin\\opencode.exe");
  });

  it("still finds the .cmd shim on Windows when no .exe exists", () => {
    const env = { Path: "C:\\bin" };
    const got = resolveOpencodePath({ env, platform: "win32", isFile: isFile(new Set(["C:\\bin\\opencode.cmd"])) });
    expect(got).toBe("C:\\bin\\opencode.cmd");
  });

  it("returns null when nothing resolves", () => {
    expect(resolveOpencodePath({ env: { PATH: "/x" }, platform: "linux", isFile: () => false })).toBeNull();
  });
});

describe("OpencodeSpawner.wake — spawn orchestration", () => {
  const creds = { url: "https://chorus.test", apiKey: "cho_secret" };

  /** Build a spawner whose spawnImpl returns our fake child + records the call. */
  function makeSpawner({
    child,
    permissionMode = "yolo",
    getSessionId,
    setSessionId,
    opencodePath = "/usr/bin/opencode",
  } = {}) {
    const calls = {};
    const spawnImpl = vi.fn((command, argv, opts) => {
      calls.command = command;
      calls.argv = argv;
      calls.opts = opts;
      return child;
    });
    const spawner = new OpencodeSpawner({
      opencodePath,
      spawnImpl,
      permissionMode,
      creds,
      platform: "linux",
      logger: { info() {}, warn() {}, error() {} },
      getSessionIdFn: getSessionId ?? (() => null),
      setSessionIdFn: setSessionId ?? (() => {}),
    });
    return { spawner, spawnImpl, calls };
  }

  it("new wake: spawns `opencode run --format json …`, prompt over stdin, key+url in env (not argv)", async () => {
    const child = makeFakeChild();
    const { spawner, calls } = makeSpawner({ child });
    const onChild = vi.fn();
    const p = spawner.wake({ prompt: "do the thing", sessionId: ANCHOR, isNew: true, onChild });
    child.stdout.emit("data", JSON.stringify({ type: "step_start", sessionID: SID, part: {} }) + "\n");
    child.emit("close", 0);
    const result = await p;

    expect(calls.argv.slice(0, 3)).toEqual(["run", "--format", "json"]);
    expect(calls.argv).not.toContain("--session");
    // prompt only on stdin, never argv
    expect(child.stdin.writes.join("")).toBe("do the thing");
    expect(calls.argv.join(" ")).not.toContain("do the thing");
    // daemon identity exported via env for the opencode-chorus plugin, key absent from argv
    expect(calls.opts.env.CHORUS_API_KEY).toBe("cho_secret");
    expect(calls.opts.env.CHORUS_BASE_URL).toBe("https://chorus.test");
    expect(calls.opts.env.CHORUS_DAEMON_HEADLESS).toBe("1");
    expect(calls.argv.join(" ")).not.toContain("cho_secret");
    // detached process group on POSIX (for interrupt parity)
    expect(calls.opts.detached).toBe(true);
    // onChild fired exactly once with the live child
    expect(onChild).toHaveBeenCalledTimes(1);
    expect(onChild).toHaveBeenCalledWith(child);
    // returns the captured opencode session id
    expect(result.exitCode).toBe(0);
    expect(result.sessionId).toBe(SID);
  });

  it("pins env.PWD to the spawn cwd (opencode trusts $PWD over getcwd for the session dir)", async () => {
    // Regression: the daemon's own inherited PWD (its start shell) must never leak
    // into the child — opencode 1.17.13 binds the session's project directory to
    // $PWD when present, silently relocating the wake out of the served path.
    const child = makeFakeChild();
    const { spawner, calls } = makeSpawner({ child });
    const prevPwd = process.env.PWD;
    process.env.PWD = "/somewhere/else";
    try {
      const p = spawner.wake({ prompt: "x", sessionId: ANCHOR, isNew: true, cwd: "/served/path" });
      child.emit("close", 0);
      await p;
    } finally {
      if (prevPwd === undefined) delete process.env.PWD;
      else process.env.PWD = prevPwd;
    }
    expect(calls.opts.cwd).toBe("/served/path");
    expect(calls.opts.env.PWD).toBe("/served/path");
  });

  it("captures sessionID and persists anchor→sessionID on a successful new run", async () => {
    const child = makeFakeChild();
    const setSessionId = vi.fn();
    const { spawner } = makeSpawner({ child, setSessionId });
    const p = spawner.wake({ prompt: "x", sessionId: ANCHOR, isNew: true });
    child.stdout.emit("data", JSON.stringify({ type: "step_start", sessionID: SID, part: {} }) + "\n");
    child.emit("close", 0);
    await p;
    expect(setSessionId).toHaveBeenCalledWith(ANCHOR, SID);
  });

  it("does NOT persist on a non-zero exit (failed run)", async () => {
    const child = makeFakeChild();
    const setSessionId = vi.fn();
    const { spawner } = makeSpawner({ child, setSessionId });
    const p = spawner.wake({ prompt: "x", sessionId: ANCHOR, isNew: true });
    child.stdout.emit("data", JSON.stringify({ type: "step_start", sessionID: SID, part: {} }) + "\n");
    child.emit("close", 1);
    await p;
    expect(setSessionId).not.toHaveBeenCalled();
  });

  it("resume wake: a known anchor produces `--session <ses_…>` (ignores passed isNew)", async () => {
    const child = makeFakeChild();
    const { spawner, calls } = makeSpawner({ child, getSessionId: () => SID });
    const p = spawner.wake({ prompt: "again", sessionId: ANCHOR, isNew: true });
    child.emit("close", 0);
    await p;
    expect(calls.argv).toContain("--session");
    expect(calls.argv).toContain(SID);
  });

  it("forwards ONLY translated conversation text to onMessage (codex dialect)", async () => {
    const child = makeFakeChild();
    const { spawner } = makeSpawner({ child });
    const onMessage = vi.fn();
    const p = spawner.wake({ prompt: "x", sessionId: ANCHOR, isNew: true, onMessage });
    child.stdout.emit("data", JSON.stringify({ type: "step_start", sessionID: SID, part: {} }) + "\n");
    child.stdout.emit(
      "data",
      JSON.stringify({ type: "text", sessionID: SID, part: { type: "text", text: "答案" } }) + "\n"
    );
    child.stdout.emit("data", JSON.stringify({ type: "step_finish", sessionID: SID, part: {} }) + "\n");
    child.emit("close", 0);
    await p;
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({
      type: "item.completed",
      item: { type: "agent_message", text: "答案" },
    });
  });

  it("never throws and returns exitCode:null when the opencode executable is unresolved", async () => {
    const child = makeFakeChild();
    const { spawner, spawnImpl } = makeSpawner({ child, opencodePath: null });
    spawner.resolveOpencodePathFn = () => null;
    const result = await spawner.wake({ prompt: "x", sessionId: ANCHOR, isNew: true });
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(result.exitCode).toBeNull();
  });

  it("never throws when spawn itself throws (returns exitCode:null)", async () => {
    const spawner = new OpencodeSpawner({
      opencodePath: "/usr/bin/opencode",
      spawnImpl: () => {
        throw new Error("EACCES");
      },
      permissionMode: "yolo",
      creds,
      platform: "linux",
      logger: { info() {}, warn() {}, error() {} },
      getSessionIdFn: () => null,
      setSessionIdFn: () => {},
    });
    const result = await spawner.wake({ prompt: "x", sessionId: ANCHOR, isNew: true });
    expect(result.exitCode).toBeNull();
  });

  it("tolerates a thrown onChild without escaping the wake path", async () => {
    const child = makeFakeChild();
    const { spawner } = makeSpawner({ child });
    const p = spawner.wake({
      prompt: "x",
      sessionId: ANCHOR,
      isNew: true,
      onChild: () => {
        throw new Error("boom");
      },
    });
    child.emit("close", 0);
    const result = await p;
    expect(result.exitCode).toBe(0);
  });
});
