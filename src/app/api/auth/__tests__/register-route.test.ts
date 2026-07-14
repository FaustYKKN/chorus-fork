// Self-registration route (fork feature): invite-code gate, validation, and
// the auto-login cookie on success.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockCreateLocalUser = vi.fn();
const mockGetCompanyByRegisterCode = vi.fn();

vi.mock("@/services/user.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/user.service")>();
  return {
    ...actual,
    createLocalUser: (...args: unknown[]) => mockCreateLocalUser(...args),
  };
});

vi.mock("@/services/company.service", () => ({
  getCompanyByRegisterCode: (...args: unknown[]) =>
    mockGetCompanyByRegisterCode(...args),
}));

import { POST } from "@/app/api/auth/register/route";
import { DuplicateLocalUserError } from "@/services/user.service";

const companyUuid = "company-0000-0000-0000-000000000001";

const createdUser = {
  uuid: "user-0000-0000-0000-000000000001",
  email: "dev@corp.local",
  name: "dev",
  oidcSub: "local_dev@corp.local",
  disabled: false,
  companyUuid,
  company: { uuid: companyUuid, name: "Test Co" },
};

function postRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:8637/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validBody = {
  inviteCode: "team-code",
  email: "dev@corp.local",
  password: "longenough",
  name: "dev",
};

const emptyCtx = { params: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret";
  mockGetCompanyByRegisterCode.mockResolvedValue({
    uuid: companyUuid,
    name: "Test Co",
  });
  mockCreateLocalUser.mockResolvedValue(createdUser);
});

describe("POST /api/auth/register", () => {
  it("rejects a missing invite code without touching the DB", async () => {
    const res = await POST(postRequest({ ...validBody, inviteCode: "  " }), emptyCtx);
    expect(res.status).toBe(422);
    expect(mockGetCompanyByRegisterCode).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const res = await POST(postRequest({ ...validBody, email: "not-an-email" }), emptyCtx);
    expect(res.status).toBe(422);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await POST(postRequest({ ...validBody, password: "short" }), emptyCtx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details.password).toMatch(/at least 8/);
  });

  it("returns 401 when the invite code matches no company", async () => {
    mockGetCompanyByRegisterCode.mockResolvedValue(null);
    const res = await POST(postRequest(validBody), emptyCtx);
    expect(res.status).toBe(401);
    expect(mockCreateLocalUser).not.toHaveBeenCalled();
  });

  it("creates the account in the code's company and logs it in", async () => {
    const res = await POST(postRequest(validBody), emptyCtx);
    expect(res.status).toBe(200);

    expect(mockCreateLocalUser).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid,
        email: "dev@corp.local",
        password: "longenough",
        name: "dev",
      })
    );

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.uuid).toBe(createdUser.uuid);
    expect(body.data.redirectTo).toBe("/onboarding");

    // Auto-login: the user_session cookie must be set
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("user_session=");
  });

  it("maps a duplicate email to a validation error on the email field", async () => {
    mockCreateLocalUser.mockRejectedValue(
      new DuplicateLocalUserError("dev@corp.local")
    );
    const res = await POST(postRequest(validBody), emptyCtx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details.email).toBeTruthy();
  });
});
