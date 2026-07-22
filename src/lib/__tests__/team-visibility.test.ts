import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agent: { findFirst: vi.fn() },
  teamMember: { findMany: vi.fn(), findFirst: vi.fn() },
  project: { findMany: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  resolveViewerUserUuid,
  getMemberTeamUuids,
  projectVisibilityWhere,
  getVisibleProjectUuids,
  canAccessProject,
} from "@/lib/team-visibility";
import type { AuthContext } from "@/types/auth";

const companyUuid = "co-1";
const userAuth = { type: "user", companyUuid, actorUuid: "user-1" } as AuthContext;
const agentAuth = { type: "agent", companyUuid, actorUuid: "agent-1" } as AuthContext;
const adminAuth = { type: "super_admin", companyUuid, actorUuid: "admin-1" } as AuthContext;

beforeEach(() => vi.clearAllMocks());

describe("resolveViewerUserUuid", () => {
  it("returns the user's own uuid for a user", async () => {
    expect(await resolveViewerUserUuid(userAuth)).toBe("user-1");
  });
  it("returns the agent's owner for an agent (R9)", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({ ownerUuid: "owner-9" });
    expect(await resolveViewerUserUuid(agentAuth)).toBe("owner-9");
  });
  it("returns null for an owner-less agent", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({ ownerUuid: null });
    expect(await resolveViewerUserUuid(agentAuth)).toBeNull();
  });
  it("returns null for super admin", async () => {
    expect(await resolveViewerUserUuid(adminAuth)).toBeNull();
  });
});

describe("projectVisibilityWhere", () => {
  it("always includes team-less projects plus the member teams", () => {
    expect(projectVisibilityWhere(["t1", "t2"])).toEqual({
      OR: [{ groupUuid: null }, { groupUuid: { in: ["t1", "t2"] } }],
    });
  });
  it("with no teams, still exposes team-less (company-wide) projects", () => {
    expect(projectVisibilityWhere([])).toEqual({
      OR: [{ groupUuid: null }, { groupUuid: { in: [] } }],
    });
  });
});

describe("getMemberTeamUuids / getVisibleProjectUuids", () => {
  it("maps membership rows to group uuids", async () => {
    mockPrisma.teamMember.findMany.mockResolvedValue([{ groupUuid: "t1" }, { groupUuid: "t2" }]);
    expect(await getMemberTeamUuids(companyUuid, "user-1")).toEqual(["t1", "t2"]);
  });
  it("returns visible project uuids filtered by the visibility where", async () => {
    mockPrisma.teamMember.findMany.mockResolvedValue([{ groupUuid: "t1" }]);
    mockPrisma.project.findMany.mockResolvedValue([{ uuid: "p-wide" }, { uuid: "p-t1" }]);
    const uuids = await getVisibleProjectUuids(companyUuid, "user-1");
    expect(uuids).toEqual(["p-wide", "p-t1"]);
    expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
      where: { companyUuid, OR: [{ groupUuid: null }, { groupUuid: { in: ["t1"] } }] },
      select: { uuid: true },
    });
  });
});

describe("canAccessProject", () => {
  it("allows a team-less (company-wide) project for anyone", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ groupUuid: null });
    expect(await canAccessProject(companyUuid, "user-1", "p1")).toBe(true);
    expect(mockPrisma.teamMember.findFirst).not.toHaveBeenCalled();
  });
  it("allows a team project for a member", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ groupUuid: "t1" });
    mockPrisma.teamMember.findFirst.mockResolvedValue({ role: "member" });
    expect(await canAccessProject(companyUuid, "user-1", "p1")).toBe(true);
  });
  it("denies a team project for a non-member", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ groupUuid: "t1" });
    mockPrisma.teamMember.findFirst.mockResolvedValue(null);
    expect(await canAccessProject(companyUuid, "user-1", "p1")).toBe(false);
  });
  it("denies a team project for a null viewer (owner-less agent)", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ groupUuid: "t1" });
    expect(await canAccessProject(companyUuid, null, "p1")).toBe(false);
    expect(mockPrisma.teamMember.findFirst).not.toHaveBeenCalled();
  });
  it("denies a missing project", async () => {
    mockPrisma.project.findFirst.mockResolvedValue(null);
    expect(await canAccessProject(companyUuid, "user-1", "nope")).toBe(false);
  });
});
