// default-login with local password accounts (fork feature): the DB is
// consulted before the env DEFAULT_USER fallback.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuthenticateLocalUser = vi.fn();
const mockFindOrCreateDefaultUser = vi.fn();

vi.mock("@/services/user.service", () => ({
  authenticateLocalUser: (...args: unknown[]) => mockAuthenticateLocalUser(...args),
  findOrCreateDefaultUser: (...args: unknown[]) => mockFindOrCreateDefaultUser(...args),
}));

import { POST } from "@/app/api/auth/default-login/route";

const companyUuid = "company-0000-0000-0000-000000000001";

const localUser = {
  uuid: "user-0000-0000-0000-000000000001",
  email: "dev@corp.local",
  name: "dev",
  oidcSub: "local_dev@corp.local",
  disabled: false,
  companyUuid,
  company: { uuid: companyUuid, name: "Test Co" },
};

const defaultUser = {
  uuid: "user-0000-0000-0000-000000000002",
  email: "admin@chorus.local",
  name: "admin",
  oidcSub: "default_admin@chorus.local",
  companyUuid,
  company: { uuid: companyUuid, name: "chorus.local" },
};

function postRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:8637/api/auth/default-login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const emptyCtx = { params: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret";
  mockAuthenticateLocalUser.mockResolvedValue({ status: "invalid" });
  mockFindOrCreateDefaultUser.mockResolvedValue(defaultUser);
});

afterEach(() => {
  delete process.env.DEFAULT_USER;
  delete process.env.DEFAULT_PASSWORD;
});

describe("POST /api/auth/default-login (local accounts)", () => {
  it("logs a local account in from the DB (no env default configured)", async () => {
    mockAuthenticateLocalUser.mockResolvedValue({ status: "ok", user: localUser });

    const res = await POST(postRequest({ email: "dev@corp.local", password: "right" }), emptyCtx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.uuid).toBe(localUser.uuid);
    expect(res.headers.get("set-cookie") || "").toContain("user_session=");
    expect(mockFindOrCreateDefaultUser).not.toHaveBeenCalled();
  });

  it("rejects a disabled local account with 403", async () => {
    mockAuthenticateLocalUser.mockResolvedValue({ status: "disabled" });

    const res = await POST(postRequest({ email: "dev@corp.local", password: "right" }), emptyCtx);
    expect(res.status).toBe(403);
  });

  it("falls back to the env DEFAULT_USER when no local account matches", async () => {
    process.env.DEFAULT_USER = "admin@chorus.local";
    process.env.DEFAULT_PASSWORD = "chorus";

    const res = await POST(postRequest({ email: "Admin@Chorus.local", password: "chorus" }), emptyCtx);

    expect(res.status).toBe(200);
    expect(mockFindOrCreateDefaultUser).toHaveBeenCalledWith("admin@chorus.local");
  });

  it("returns 401 when neither the DB nor the env pair matches", async () => {
    process.env.DEFAULT_USER = "admin@chorus.local";
    process.env.DEFAULT_PASSWORD = "chorus";

    const res = await POST(postRequest({ email: "admin@chorus.local", password: "wrong" }), emptyCtx);
    expect(res.status).toBe(401);
  });

  it("returns 401 (not 'default auth disabled') when env default auth is off entirely", async () => {
    const res = await POST(postRequest({ email: "ghost@corp.local", password: "whatever" }), emptyCtx);
    expect(res.status).toBe(401);
  });
});
