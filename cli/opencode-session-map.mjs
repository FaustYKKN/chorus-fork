// cli/opencode-session-map.mjs
// Daemon-local persistence of the opencode `anchor → sessionID` map. opencode
// GENERATES its own session id (`ses_…`, like Codex's thread id and unlike
// Claude's client-supplied --session-id), so to make a wake resumable across
// daemon restarts we record the generated id keyed by the Chorus session anchor
// and `opencode run --session <id>` on the next wake.
//
// The store is `{ "<anchor>": "<sessionID>" }` at ~/.chorus/opencode-sessions.json.
// The read/write machinery is IDENTICAL to the Codex map (best-effort, atomic
// write, never throws into the wake path), so we delegate to codex-session-map's
// exported functions with our own path rather than duplicating them.

import { homedir } from "node:os";
import { join } from "node:path";
import { getThreadId, setThreadId } from "./codex-session-map.mjs";

/** Absolute path to the opencode session-id map, alongside ~/.chorus/daemon.json. */
export function opencodeSessionMapPath() {
  return join(homedir(), ".chorus", "opencode-sessions.json");
}

/**
 * Look up the opencode session id recorded for `anchor`, or null. Never throws.
 * @param {string} anchor
 * @param {{ path?: string, read?: (p: string) => string, logger?: any }} [deps]
 * @returns {string | null}
 */
export function getSessionId(anchor, deps = {}) {
  return getThreadId(anchor, { path: opencodeSessionMapPath(), ...deps });
}

/**
 * Record `anchor → sessionID`. Best-effort; never throws into the wake path.
 * @param {string} anchor
 * @param {string} sessionId
 * @param {object} [deps]
 * @returns {void}
 */
export function setSessionId(anchor, sessionId, deps = {}) {
  setThreadId(anchor, sessionId, { path: opencodeSessionMapPath(), ...deps });
}
