// cli/__tests__/daemon-console.test.mjs
// The daemon's loopback-only local console (daemon-local-console): log ring,
// whitelist validation/persistence, and the HTTP surface (real server on an
// ephemeral port — no mocked http).

import { describe, it, expect, vi } from "vitest";
import {
  createLogRing,
  sanitizeCwdList,
  persistCwds,
  readConfiguredCwds,
  createDaemonConsole,
} from "../daemon-console.mjs";

describe("createLogRing", () => {
  it("keeps insertion order and splits multi-line entries", () => {
    const ring = createLogRing(10);
    ring.push("a");
    ring.push("b\nc");
    expect(ring.lines()).toEqual(["a", "b", "c"]);
  });

  it("caps at the line capacity, dropping the oldest", () => {
    const ring = createLogRing(3);
    for (const l of ["1", "2", "3", "4", "5"]) ring.push(l);
    expect(ring.lines()).toEqual(["3", "4", "5"]);
  });
});

describe("sanitizeCwdList", () => {
  it("rejects non-array input", () => {
    expect(sanitizeCwdList("nope").ok).toBe(false);
    expect(sanitizeCwdList(undefined).ok).toBe(false);
  });

  it("accepts POSIX, Windows-drive, UNC and ~ paths; trims and dedupes", () => {
    const r = sanitizeCwdList([
      " /a/b ",
      "C:\\work",
      "D:/proj",
      "\\\\nas\\share",
      "~/proj",
      "/a/b",
      "",
    ]);
    expect(r.ok).toBe(true);
    expect(r.cwds).toEqual(["/a/b", "C:\\work", "D:/proj", "\\\\nas\\share", "~/proj"]);
    expect(r.rejected).toEqual([]);
  });

  it("rejects relative paths (they would resolve against the daemon's cwd)", () => {
    const r = sanitizeCwdList(["/ok", "relative/path", "also-relative"]);
    expect(r.ok).toBe(true);
    expect(r.cwds).toEqual(["/ok"]);
    expect(r.rejected).toEqual(["relative/path", "also-relative"]);
  });

  it("errors when nothing valid remains — a daemon must serve at least one path", () => {
    const r = sanitizeCwdList(["relative", "   "]);
    expect(r.ok).toBe(false);
    expect(r.rejected).toEqual(["relative"]);
  });
});

describe("persistCwds", () => {
  it("read-modify-writes daemon.json preserving other keys, 0600, and mkdirs each path", () => {
    const files = { "/login.json": JSON.stringify({ url: "http://x", apiKey: "cho_k", wakeConcurrency: 1 }) };
    const written = {};
    const made = [];
    const result = persistCwds(["/a", "~/b"], {
      loginPath: "/login.json",
      readFileSync: (p) => {
        if (files[p] === undefined) throw new Error("ENOENT");
        return files[p];
      },
      writeFileSync: (p, content, opts) => {
        written[p] = { content, opts };
      },
      mkdirSync: (dir) => {
        made.push(dir);
      },
    });
    const saved = JSON.parse(written["/login.json"].content);
    expect(saved).toEqual({ url: "http://x", apiKey: "cho_k", wakeConcurrency: 1, cwds: ["/a", "~/b"] });
    expect(written["/login.json"].opts).toEqual({ mode: 0o600 });
    // ~-paths are expanded at daemon start, not created here.
    expect(made).toEqual(["/a"]);
    expect(result.ensured).toEqual(["/a"]);
    expect(result.failed).toEqual([]);
  });

  it("collects mkdir failures without throwing (config save already succeeded)", () => {
    const written = {};
    const result = persistCwds(["/ok", "/denied"], {
      loginPath: "/login.json",
      readFileSync: () => {
        throw new Error("ENOENT");
      },
      writeFileSync: (p, content, opts) => {
        written[p] = { content, opts };
      },
      mkdirSync: (dir) => {
        if (dir === "/denied") throw new Error("EACCES: permission denied");
      },
    });
    expect(JSON.parse(written["/login.json"].content)).toEqual({ cwds: ["/ok", "/denied"] });
    expect(result.ensured).toEqual(["/ok"]);
    expect(result.failed).toEqual([{ path: "/denied", error: "EACCES: permission denied" }]);
  });
});

describe("readConfiguredCwds", () => {
  it("returns the string entries of cwds", () => {
    const read = () => JSON.stringify({ cwds: ["/a", 42, "/b"] });
    expect(readConfiguredCwds({ loginPath: "/x", readFileSync: read })).toEqual(["/a", "/b"]);
  });

  it("returns null on missing file, corrupt JSON, or non-array cwds", () => {
    expect(
      readConfiguredCwds({
        loginPath: "/x",
        readFileSync: () => {
          throw new Error("ENOENT");
        },
      })
    ).toBeNull();
    expect(readConfiguredCwds({ loginPath: "/x", readFileSync: () => "{oops" })).toBeNull();
    expect(readConfiguredCwds({ loginPath: "/x", readFileSync: () => JSON.stringify({ cwds: "no" }) })).toBeNull();
  });
});

describe("createDaemonConsole — HTTP surface", () => {
  /** Start a console on an ephemeral port; returns {console, base}. */
  async function startConsole(overrides = {}) {
    const con = createDaemonConsole({
      port: 0,
      getState: overrides.getState ?? (() => ({ hello: "world" })),
      persist: overrides.persist,
      onRestart: overrides.onRestart,
      onStop: overrides.onStop,
      logger: overrides.logger ?? { info() {}, warn() {} },
    });
    const url = await con.start();
    expect(url).not.toBeNull();
    const port = con.server.address().port;
    return { con, base: `http://127.0.0.1:${port}` };
  }

  it("serves the page at / and the injected state at /api/state", async () => {
    const { con, base } = await startConsole({ getState: () => ({ agentName: "a1", queue: {} }) });
    try {
      const page = await fetch(`${base}/`);
      expect(page.status).toBe(200);
      expect(page.headers.get("content-type")).toContain("text/html");
      expect(await page.text()).toContain("Chorus Daemon 本地控制台");

      const state = await fetch(`${base}/api/state`);
      expect(state.status).toBe(200);
      expect(await state.json()).toEqual({ agentName: "a1", queue: {} });
    } finally {
      con.stop();
    }
  });

  it("POST /api/cwds validates, persists the cleaned list, and reports results", async () => {
    const persist = vi.fn(() => ({ ensured: ["/a"], failed: [] }));
    const { con, base } = await startConsole({ persist });
    try {
      const res = await fetch(`${base}/api/cwds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwds: [" /a ", "bad-relative", "/a"] }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(persist).toHaveBeenCalledWith(["/a"]);
      expect(body.ok).toBe(true);
      expect(body.cwds).toEqual(["/a"]);
      expect(body.rejected).toEqual(["bad-relative"]);
      expect(body.ensured).toEqual(["/a"]);
    } finally {
      con.stop();
    }
  });

  it("POST /api/cwds rejects an unusable submission with 400 (and never persists)", async () => {
    const persist = vi.fn();
    const { con, base } = await startConsole({ persist });
    try {
      const empty = await fetch(`${base}/api/cwds`, {
        method: "POST",
        body: JSON.stringify({ cwds: ["all-relative"] }),
      });
      expect(empty.status).toBe(400);
      const badJson = await fetch(`${base}/api/cwds`, { method: "POST", body: "{oops" });
      expect(badJson.status).toBe(400);
      expect(persist).not.toHaveBeenCalled();
    } finally {
      con.stop();
    }
  });

  it("POST /api/restart and /api/stop respond FIRST, then fire the action", async () => {
    const onRestart = vi.fn();
    const onStop = vi.fn();
    const { con, base } = await startConsole({ onRestart, onStop });
    try {
      const r = await fetch(`${base}/api/restart`, { method: "POST" });
      expect(r.status).toBe(200);
      // The action is deferred past the response (the handler may kill this server).
      expect(onRestart).not.toHaveBeenCalled();
      await new Promise((res) => setTimeout(res, 250));
      expect(onRestart).toHaveBeenCalledOnce();

      const s = await fetch(`${base}/api/stop`, { method: "POST" });
      expect(s.status).toBe(200);
      await new Promise((res) => setTimeout(res, 250));
      expect(onStop).toHaveBeenCalledOnce();
    } finally {
      con.stop();
    }
  });

  it("404s unknown routes", async () => {
    const { con, base } = await startConsole();
    try {
      expect((await fetch(`${base}/api/nope`)).status).toBe(404);
      expect((await fetch(`${base}/api/state`, { method: "POST" })).status).toBe(404);
    } finally {
      con.stop();
    }
  });

  it("resolves start() to null (daemon continues) when the port is taken", async () => {
    const { con, base } = await startConsole();
    const takenPort = con.server.address().port;
    try {
      const warn = vi.fn();
      const second = createDaemonConsole({
        port: takenPort,
        getState: () => ({}),
        logger: { info() {}, warn },
      });
      const url = await second.start();
      expect(url).toBeNull();
      expect(warn).toHaveBeenCalledOnce();
      second.stop();
      // The first console still serves.
      expect((await fetch(`${base}/api/state`)).status).toBe(200);
    } finally {
      con.stop();
    }
  });
});
