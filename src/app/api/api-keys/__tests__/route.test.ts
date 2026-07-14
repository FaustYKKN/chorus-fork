// API-keys routes ownership isolation (fork: agent-ownership-isolation).
//
// The CRITICAL guard: minting a key for someone else's agent would hand the
// caller that machine's identity and bypass the whole assignment fence. These
// tests drive the route handlers with a mocked prisma and assert the agent
// lookups are owner-scoped (foreign agent → the query returns null → 404).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockPrisma = vi.hoisted(() => ({
  agent: { findFirst: vi.fn(), findMany: vi.fn() },
  apiKey: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  isUser: (auth: { type: string }) => auth?.type === "user",
}));
vi.mock("@/lib/api-key", () => ({
  generateApiKey: () => ({ key: "cho_test", hash: "hash", prefix: "cho_test" }),
}));

import { GET, POST } from "@/app/api/api-keys/route";
import { DELETE } from "@/app/api/api-keys/[uuid]/route";

const companyUuid = "company-0000-0000-0000-000000000001";
const YANG = "user-yang-0000-0000-0000-000000000001";
const YANG_AGENT = "agent-yang-0000-0000-0000-00000000000a";
const LI_AGENT = "agent-li-0000-0000-0000-00000000000c";
const KEY_UUID = "key-0000-0000-0000-000000000001";

const yangAuth = { type: "user", companyUuid, actorUuid: YANG };

function req(url: string, init?: { method?: string; body?: string }) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
}
const ctx = (uuid: string) => ({ params: Promise.resolve({ uuid }) });
const emptyCtx = { params: Promise.resolve({}) } as { params: Promise<Record<string, string>> };

// The route's owner-scoped agent lookup: return Yang's agent ONLY when the
// where clause carries ownerUuid === YANG. A foreign agent (Li's) never matches.
function ownerScopedAgentFindFirst({ where }: { where: { uuid: string; ownerUuid?: string } }) {
  if (where.uuid === YANG_AGENT && where.ownerUuid === YANG) {
    return Promise.resolve({ uuid: YANG_AGENT, name: "yang-oc", roles: ["developer_agent"] });
  }
  return Promise.resolve(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthContext.mockResolvedValue(yangAuth);
  mockPrisma.agent.findFirst.mockImplementation(ownerScopedAgentFindFirst);
  mockPrisma.agent.findMany.mockResolvedValue([{ uuid: YANG_AGENT }]);
  mockPrisma.apiKey.create.mockResolvedValue({
    uuid: KEY_UUID, keyPrefix: "cho_test", name: null, expiresAt: null, createdAt: new Date(),
  });
  mockPrisma.apiKey.findMany.mockResolvedValue([]);
  mockPrisma.apiKey.count.mockResolvedValue(0);
});

describe("POST /api/api-keys ownership", () => {
  it("REFUSES minting a key for someone else's agent (404, no create)", async () => {
    const res = await POST(
      req("/api/api-keys", { method: "POST", body: JSON.stringify({ agentUuid: LI_AGENT }) }),
      emptyCtx,
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("allows minting a key for the caller's OWN agent", async () => {
    const res = await POST(
      req("/api/api-keys", { method: "POST", body: JSON.stringify({ agentUuid: YANG_AGENT }) }),
      emptyCtx,
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.apiKey.create).toHaveBeenCalled();
    // The agent lookup must be owner-scoped.
    expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ uuid: YANG_AGENT, ownerUuid: YANG }),
      }),
    );
  });
});

describe("GET /api/api-keys ownership", () => {
  it("scopes the key list to the caller's own agents via a relation filter", async () => {
    await GET(req("/api/api-keys"), emptyCtx);
    const listCall = mockPrisma.apiKey.findMany.mock.calls[0][0];
    expect(listCall.where.agent).toEqual({ ownerUuid: YANG });
  });
});

describe("DELETE /api/api-keys/[uuid] ownership", () => {
  it("REFUSES revoking a key on someone else's agent (404, no update)", async () => {
    // The lookup carries the ownership relation filter, so a foreign agent's key
    // simply isn't found.
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);
    const res = await DELETE(req(`/api/api-keys/${KEY_UUID}`, { method: "DELETE" }), ctx(KEY_UUID));
    expect(res.status).toBe(404);
    expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
    // Assert the refusal is BY ownership, not merely "key missing".
    const call = mockPrisma.apiKey.findFirst.mock.calls[0][0];
    expect(call.where.agent).toEqual({ ownerUuid: YANG });
  });

  it("allows revoking a key on the caller's own agent", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({ uuid: KEY_UUID, revokedAt: null });
    mockPrisma.apiKey.update.mockResolvedValue({ uuid: KEY_UUID });
    const res = await DELETE(req(`/api/api-keys/${KEY_UUID}`, { method: "DELETE" }), ctx(KEY_UUID));
    expect(res.status).toBe(200);
    expect(mockPrisma.apiKey.update).toHaveBeenCalled();
  });
});
