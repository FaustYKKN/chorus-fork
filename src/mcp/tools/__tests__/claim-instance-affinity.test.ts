// Instance affinity on chorus_claim_task (fix: a session woken in directory B
// must not claim — and thereby un-pin — a task pinned to directory A's
// AgentInstance). Mocks every service registerDeveloperTools imports; drives
// the captured handler directly.

import { vi, describe, it, expect, beforeEach } from "vitest";

const mockTaskService = vi.hoisted(() => ({
  getTaskByUuid: vi.fn(),
  claimTask: vi.fn(),
  getTask: vi.fn(),
}));

const mockActivityService = vi.hoisted(() => ({
  createActivity: vi.fn(),
}));

vi.mock("@/services/task.service", () => mockTaskService);
vi.mock("@/services/activity.service", () => mockActivityService);
vi.mock("@/services/comment.service", () => ({}));
vi.mock("@/services/session.service", () => ({}));

type ToolHandler = (params: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

const tools: Record<string, { handler: ToolHandler }> = {};

function makeServer() {
  return {
    registerTool: (name: string, _config: unknown, handler: ToolHandler) => {
      tools[name] = { handler };
    },
  };
}

import type { AgentAuthContext } from "@/types/auth";
import { registerDeveloperTools } from "@/mcp/tools/developer";

const COMPANY_UUID = "company-0000-0000-0000-000000000001";
const ACTOR_UUID = "agent-0000-0000-0000-000000000001";
const TASK_UUID = "44444444-4444-4444-8444-444444444444";
const INSTANCE_A = "aaaaaaaa-1111-4111-8111-111111111111";
const INSTANCE_B = "bbbbbbbb-2222-4222-8222-222222222222";

function makeAuth(instanceUuid?: string): AgentAuthContext {
  return {
    type: "agent",
    companyUuid: COMPANY_UUID,
    actorUuid: ACTOR_UUID,
    agentName: "Test Agent",
    roles: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    permissions: ["task:write", "task:read"] as any,
    instanceUuid,
  };
}

function registerWith(auth: AgentAuthContext) {
  Object.keys(tools).forEach((k) => delete tools[k]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerDeveloperTools(makeServer() as any, auth);
}

const pinnedTask = {
  uuid: TASK_UUID,
  projectUuid: "proj-1",
  assigneeType: "agent_instance",
  assigneeUuid: INSTANCE_A,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTaskService.getTaskByUuid.mockResolvedValue(pinnedTask);
  mockTaskService.claimTask.mockResolvedValue({ uuid: TASK_UUID });
  mockTaskService.getTask.mockResolvedValue({ uuid: TASK_UUID, dependencies: [] });
  mockActivityService.createActivity.mockResolvedValue({});
});

describe("chorus_claim_task instance affinity", () => {
  it("rejects a claim from a session on a DIFFERENT instance", async () => {
    registerWith(makeAuth(INSTANCE_B));
    const result = await tools["chorus_claim_task"].handler({ taskUuid: TASK_UUID });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/pinned to a specific instance/);
    expect(mockTaskService.claimTask).not.toHaveBeenCalled();
  });

  it("rejects a claim carrying NO instance identity for a pinned task", async () => {
    registerWith(makeAuth(undefined));
    const result = await tools["chorus_claim_task"].handler({ taskUuid: TASK_UUID });
    expect(result.isError).toBe(true);
    expect(mockTaskService.claimTask).not.toHaveBeenCalled();
  });

  it("allows the MATCHING instance and preserves the pin through the claim", async () => {
    registerWith(makeAuth(INSTANCE_A));
    const result = await tools["chorus_claim_task"].handler({ taskUuid: TASK_UUID });
    expect(result.isError).toBeUndefined();
    expect(mockTaskService.claimTask).toHaveBeenCalledWith(
      expect.objectContaining({ taskUuid: TASK_UUID, instanceUuid: INSTANCE_A }),
    );
  });

  it("leaves un-pinned tasks claimable by any session (no instance required)", async () => {
    mockTaskService.getTaskByUuid.mockResolvedValue({
      uuid: TASK_UUID,
      projectUuid: "proj-1",
      assigneeType: "agent",
      assigneeUuid: ACTOR_UUID,
    });
    registerWith(makeAuth(undefined));
    const result = await tools["chorus_claim_task"].handler({ taskUuid: TASK_UUID });
    expect(result.isError).toBeUndefined();
    expect(mockTaskService.claimTask).toHaveBeenCalledWith(
      expect.objectContaining({ taskUuid: TASK_UUID, instanceUuid: undefined }),
    );
  });
});
