// cli/__tests__/event-router-cwd-serialization.test.mjs
// Layer 1 — per-cwd wake serialization. The EventRouter picks the WakeQueue
// lane; with `serveCwd` wired (the connection's served directory), every wake
// for that directory shares one lane — so two DIFFERENT ideas in the SAME cwd
// serialize (never two opencode in one working tree), while different cwds get
// different lanes (concurrent up to the global cap). Without `serveCwd`, the
// lane falls back to the per-idea key (pre-Layer-1 behavior).
//
// Exercised through the public `dispatch` API with a fake queue that records the
// lane key each wake is enqueued under, matching the existing router test style.
import { describe, it, expect, vi } from "vitest";
import { EventRouter } from "../event-router.mjs";
import { WAKE_ACTIONS } from "../prompts.mjs";

const silent = { info() {}, warn() {}, error() {} };

/** A wake-action notification, distinct per (uuid, entityUuid). */
function wakeNotif(uuid, ideaUuid) {
  return {
    uuid,
    projectUuid: "proj-1",
    entityType: "idea",
    entityUuid: ideaUuid,
    entityTitle: "idea",
    action: "mentioned",
    message: "please look",
    actorType: "user",
    actorUuid: "user-1",
    actorName: "Alice",
  };
}

/** keyFor derives the (pre-Layer-1) idea key straight from the notification. */
function wire({ serveCwd, notifications }) {
  const enqueued = [];
  const mcpClient = { callTool: vi.fn(async () => ({ notifications })) };
  const waker = {
    keyFor: vi.fn(async (n) => ({
      key: `idea:${n.entityUuid}`,
      rootIdeaUuid: n.entityUuid,
      directIdeaUuid: n.entityUuid,
    })),
    markQueued: vi.fn(),
    wake: vi.fn(async () => {}),
  };
  const queue = { enqueue: (key, task) => enqueued.push({ key, task }) };
  const router = new EventRouter({
    mcpClient,
    waker,
    queue,
    wakeActions: WAKE_ACTIONS,
    seen: new Set(),
    getConnectionUuid: () => null,
    serveCwd,
    logger: silent,
  });
  return { enqueued, waker, router };
}

const flush = () => new Promise((res) => setTimeout(res, 0));

describe("event-router — per-cwd wake serialization (Layer 1)", () => {
  it("two DIFFERENT ideas in the SAME served cwd share ONE lane (→ serialize)", async () => {
    const notifs = [wakeNotif("ni-A", "idea-A"), wakeNotif("ni-B", "idea-B")];
    const { enqueued, router } = wire({ serveCwd: "D:\\work", notifications: notifs });

    router.dispatch({ type: "new_notification", notificationUuid: "ni-A" });
    router.dispatch({ type: "new_notification", notificationUuid: "ni-B" });
    await flush();

    expect(enqueued).toHaveLength(2);
    // Both wakes land on the SAME cwd lane despite being different ideas — the
    // WakeQueue then runs them strictly serially (no two opencode in one tree).
    expect(enqueued[0].key).toBe("cwd:D:\\work");
    expect(enqueued[1].key).toBe("cwd:D:\\work");
  });

  it("the SAME idea in DIFFERENT served cwds gets DIFFERENT lanes (→ concurrent)", async () => {
    const notif = [wakeNotif("ni-A", "idea-A")];
    const a = wire({ serveCwd: "D:\\dirA", notifications: notif });
    const b = wire({ serveCwd: "D:\\dirB", notifications: notif });

    a.router.dispatch({ type: "new_notification", notificationUuid: "ni-A" });
    b.router.dispatch({ type: "new_notification", notificationUuid: "ni-A" });
    await flush();

    expect(a.enqueued[0].key).toBe("cwd:D:\\dirA");
    expect(b.enqueued[0].key).toBe("cwd:D:\\dirB");
    expect(a.enqueued[0].key).not.toBe(b.enqueued[0].key);
  });

  it("without serveCwd, the lane falls back to the per-idea key (pre-Layer-1 behavior)", async () => {
    const notif = [wakeNotif("ni-A", "idea-A")];
    const { enqueued, router } = wire({ serveCwd: undefined, notifications: notif });

    router.dispatch({ type: "new_notification", notificationUuid: "ni-A" });
    await flush();

    expect(enqueued[0].key).toBe("idea:idea-A");
  });

  it("still passes the idea key (not the cwd lane) to wake() for session anchoring", async () => {
    const notif = [wakeNotif("ni-A", "idea-A")];
    const { enqueued, waker, router } = wire({ serveCwd: "D:\\work", notifications: notif });

    router.dispatch({ type: "new_notification", notificationUuid: "ni-A" });
    await flush();

    // The lane is per-cwd, but running the enqueued task must call wake() with the
    // IDEA key so the server-side snapshot + session anchor are unchanged.
    expect(enqueued[0].key).toBe("cwd:D:\\work");
    await enqueued[0].task();
    expect(waker.wake).toHaveBeenCalledTimes(1);
    expect(waker.wake.mock.calls[0][1]).toBe("idea:idea-A");
  });
});
