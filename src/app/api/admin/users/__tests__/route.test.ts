// Super admin user management routes (fork feature).
// requireSuperAdmin is mocked to a pass-through — auth wrapping itself is
// covered by the shared auth tests; these tests cover the handlers.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requireSuperAdmin: (handler: any) => handler,
}));

const mockListUsers = vi.fn();
const mockCreateLocalUser = vi.fn();
const mockGetUserByUuid = vi.fn();
const mockResetUserPassword = vi.fn();
const mockSetUserDisabled = vi.fn();
const mockUpdateUserName = vi.fn();
const mockGetCompanyByUuid = vi.fn();

vi.mock("@/services/user.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/user.service")>();
  return {
    ...actual,
    listUsers: (...args: unknown[]) => mockListUsers(...args),
    createLocalUser: (...args: unknown[]) => mockCreateLocalUser(...args),
    getUserByUuid: (...args: unknown[]) => mockGetUserByUuid(...args),
    resetUserPassword: (...args: unknown[]) => mockResetUserPassword(...args),
    setUserDisabled: (...args: unknown[]) => mockSetUserDisabled(...args),
    updateUserName: (...args: unknown[]) => mockUpdateUserName(...args),
  };
});

vi.mock("@/services/company.service", () => ({
  getCompanyByUuid: (...args: unknown[]) => mockGetCompanyByUuid(...args),
}));

import { GET, POST } from "@/app/api/admin/users/route";
import { PATCH } from "@/app/api/admin/users/[uuid]/route";
import { DuplicateLocalUserError } from "@/services/user.service";

const companyUuid = "company-0000-0000-0000-000000000001";
const userUuid = "user-0000-0000-0000-000000000001";

const listedUser = {
  uuid: userUuid,
  email: "dev@corp.local",
  name: "dev",
  disabled: false,
  hasPassword: true,
  createdAt: new Date("2026-07-01T00:00:00Z"),
  companyUuid,
  company: { uuid: companyUuid, name: "Test Co" },
};

const createdUser = {
  uuid: userUuid,
  email: "new@corp.local",
  name: "new",
  oidcSub: "local_new@corp.local",
  disabled: false,
  companyUuid,
  company: { uuid: companyUuid, name: "Test Co" },
};

function getRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost:8637/api/admin/users${query}`);
}

function postRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:8637/api/admin/users", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function patchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:8637/api/admin/users/${userUuid}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const patchCtx = { params: Promise.resolve({ uuid: userUuid }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockListUsers.mockResolvedValue({ users: [listedUser], total: 1 });
  mockGetCompanyByUuid.mockResolvedValue({ id: 1, uuid: companyUuid, name: "Test Co" });
  mockCreateLocalUser.mockResolvedValue(createdUser);
  mockGetUserByUuid.mockResolvedValue(listedUser);
  mockResetUserPassword.mockResolvedValue(listedUser);
  mockSetUserDisabled.mockResolvedValue(listedUser);
  mockUpdateUserName.mockResolvedValue(listedUser);
});

describe("GET /api/admin/users", () => {
  it("lists users with hasPassword exposed and passes the company filter through", async () => {
    const res = await GET(getRequest(`?companyUuid=${companyUuid}`), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toMatchObject({
      uuid: userUuid,
      email: "dev@corp.local",
      hasPassword: true,
    });
    expect(mockListUsers).toHaveBeenCalledWith(
      expect.objectContaining({ companyUuid })
    );
  });
});

describe("POST /api/admin/users", () => {
  const validBody = {
    companyUuid,
    email: "new@corp.local",
    password: "longenough",
  };

  it("rejects an invalid email", async () => {
    const res = await POST(postRequest({ ...validBody, email: "nope" }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(422);
  });

  it("rejects a short password", async () => {
    const res = await POST(postRequest({ ...validBody, password: "short" }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(422);
  });

  it("404s on an unknown company", async () => {
    mockGetCompanyByUuid.mockResolvedValue(null);
    const res = await POST(postRequest(validBody), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(404);
  });

  it("creates a local account", async () => {
    const res = await POST(postRequest(validBody), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.uuid).toBe(userUuid);
    expect(body.data.hasPassword).toBe(true);
  });

  it("maps duplicate emails to a field validation error", async () => {
    mockCreateLocalUser.mockRejectedValue(
      new DuplicateLocalUserError("new@corp.local")
    );
    const res = await POST(postRequest(validBody), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details.email).toBeTruthy();
  });
});

describe("PATCH /api/admin/users/:uuid", () => {
  it("404s on an unknown user", async () => {
    mockGetUserByUuid.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ disabled: true }), patchCtx);
    expect(res.status).toBe(404);
  });

  it("rejects an empty update", async () => {
    const res = await PATCH(patchRequest({}), patchCtx);
    expect(res.status).toBe(400);
  });

  it("rejects a short password without applying anything", async () => {
    const res = await PATCH(patchRequest({ password: "short" }), patchCtx);
    expect(res.status).toBe(422);
    expect(mockResetUserPassword).not.toHaveBeenCalled();
  });

  it("resets the password", async () => {
    const res = await PATCH(patchRequest({ password: "longenough" }), patchCtx);
    expect(res.status).toBe(200);
    expect(mockResetUserPassword).toHaveBeenCalledWith(userUuid, "longenough");
  });

  it("toggles disabled and renames in one call", async () => {
    const res = await PATCH(
      patchRequest({ disabled: true, name: "新名字" }),
      patchCtx
    );
    expect(res.status).toBe(200);
    expect(mockSetUserDisabled).toHaveBeenCalledWith(userUuid, true);
    expect(mockUpdateUserName).toHaveBeenCalledWith(userUuid, "新名字");
  });
});
