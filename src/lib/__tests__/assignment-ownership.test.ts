// Agent-ownership isolation guard (fork feature). Prisma is mocked; the guard's
// branching (owner resolution, fail-closed, instance-pin resolution) is driven
// directly. See docs/specs/agent-ownership-isolation.md.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: { findFirst: vi.fn() },
  agent: { findFirst: vi.fn() },
  agentInstance: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  resolveOwnerUuid,
  assertAgentAssignmentOwnership,
} from "@/lib/assignment-ownership";
import { AssignmentNotOwnedError } from "@/lib/errors";

const COMPANY = "company-0000-0000-0000-000000000001";
const OWNER_YANG = "user-yang-0000-0000-0000-000000000001";
const OWNER_LI = "user-li-0000-0000-0000-000000000002";
const AGENT_YANG = "agent-yang-0000-0000-0000-00000000000a";
const PM_YANG = "agent-pmyang-0000-0000-0000-00000000000b";
const AGENT_LI = "agent-li-0000-0000-0000-00000000000c";
const AGENT_ORPHAN = "agent-orphan-0000-0000-0000-00000000000d";
const INSTANCE_LI = "inst-li-0000-0000-0000-00000000000e";

// Dispatch prisma lookups by uuid so each test needs no per-case wiring.
const USERS: Record<string, { uuid: string }> = {
  [OWNER_YANG]: { uuid: OWNER_YANG },
  [OWNER_LI]: { uuid: OWNER_LI },
};
const AGENTS: Record<string, { ownerUuid: string | null }> = {
  [AGENT_YANG]: { ownerUuid: OWNER_YANG },
  [PM_YANG]: { ownerUuid: OWNER_YANG },
  [AGENT_LI]: { ownerUuid: OWNER_LI },
  [AGENT_ORPHAN]: { ownerUuid: null },
};
const INSTANCES: Record<string, { agentUuid: string }> = {
  [INSTANCE_LI]: { agentUuid: AGENT_LI },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(USERS[where.uuid] ?? null),
  );
  mockPrisma.agent.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(AGENTS[where.uuid] ?? null),
  );
  mockPrisma.agentInstance.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(INSTANCES[where.uuid] ?? null),
  );
});

describe("resolveOwnerUuid", () => {
  it("resolves a user to itself", async () => {
    await expect(resolveOwnerUuid(COMPANY, OWNER_YANG)).resolves.toBe(OWNER_YANG);
  });
  it("resolves an agent to its ownerUuid", async () => {
    await expect(resolveOwnerUuid(COMPANY, AGENT_YANG)).resolves.toBe(OWNER_YANG);
  });
  it("returns null for an unknown / instance uuid", async () => {
    await expect(resolveOwnerUuid(COMPANY, INSTANCE_LI)).resolves.toBeNull();
  });
  it("returns null for null input without querying", async () => {
    await expect(resolveOwnerUuid(COMPANY, null)).resolves.toBeNull();
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });
});

describe("assertAgentAssignmentOwnership", () => {
  const assign = (over: Partial<Parameters<typeof assertAgentAssignmentOwnership>[0]>) =>
    assertAgentAssignmentOwnership({
      companyUuid: COMPANY,
      resolvedAssigneeType: "agent",
      resolvedAssigneeUuid: AGENT_YANG,
      assignerActorUuid: OWNER_YANG,
      ...over,
    });

  it("allows a user assigning to their OWN agent", async () => {
    await expect(assign({})).resolves.toBeUndefined();
  });

  it("allows a PM agent assigning to another agent of the SAME owner", async () => {
    await expect(
      assign({ assignerActorUuid: PM_YANG, resolvedAssigneeUuid: AGENT_YANG }),
    ).resolves.toBeUndefined();
  });

  it("REJECTS a user assigning to someone else's agent", async () => {
    await expect(
      assign({ resolvedAssigneeUuid: AGENT_LI }),
    ).rejects.toBeInstanceOf(AssignmentNotOwnedError);
  });

  it("REJECTS a PM agent reaching across owners", async () => {
    await expect(
      assign({ assignerActorUuid: PM_YANG, resolvedAssigneeUuid: AGENT_LI }),
    ).rejects.toBeInstanceOf(AssignmentNotOwnedError);
  });

  it("allows a self-claim (assigner falls back to the target agent itself)", async () => {
    // developer.ts self-claim: assignedByUuid absent → assignerActorUuid is the
    // claiming agent, which owns the target trivially.
    await expect(
      assign({ assignerActorUuid: AGENT_YANG, resolvedAssigneeUuid: AGENT_YANG }),
    ).resolves.toBeUndefined();
  });

  it("REJECTS an instance pin to a FOREIGN machine even when the assigner is valid", async () => {
    // The pin overrode the assignee to agent_instance of Li's agent; the guard
    // checks the RESOLVED assignee, so Yang cannot pin work onto Li's machine.
    await expect(
      assign({
        resolvedAssigneeType: "agent_instance",
        resolvedAssigneeUuid: INSTANCE_LI,
        assignerActorUuid: OWNER_YANG,
      }),
    ).rejects.toBeInstanceOf(AssignmentNotOwnedError);
  });

  it("fail-closed: REJECTS assigning to an agent with no owner (unmigrated)", async () => {
    await expect(
      assign({ resolvedAssigneeUuid: AGENT_ORPHAN }),
    ).rejects.toBeInstanceOf(AssignmentNotOwnedError);
  });

  it("does NOT fence a user assignment (assigning to a person never drives a machine)", async () => {
    // Even a nonsensical assigner passes when the target is a person.
    await expect(
      assign({
        resolvedAssigneeType: "user",
        resolvedAssigneeUuid: OWNER_LI,
        assignerActorUuid: "whatever",
      }),
    ).resolves.toBeUndefined();
    expect(mockPrisma.agent.findFirst).not.toHaveBeenCalled();
  });
});
