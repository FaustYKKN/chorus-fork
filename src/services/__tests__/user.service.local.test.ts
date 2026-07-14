// Local password accounts (fork feature): service-layer behavior.
// bcryptjs runs for real (pure JS); prisma is mocked like user.service.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const mockPrisma = vi.hoisted(() => ({
  user: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  company: {
    findFirst: vi.fn(),
    count: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  createLocalUser,
  authenticateLocalUser,
  hasLocalUsers,
  resetUserPassword,
  setUserDisabled,
  DuplicateLocalUserError,
} from "@/services/user.service";
import {
  getCompanyByRegisterCode,
  isRegistrationOpen,
} from "@/services/company.service";

const companyUuid = "company-0000-0000-0000-000000000001";
const company = { uuid: companyUuid, name: "Test Co" };

function makeLocalUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    uuid: "user-0000-0000-0000-000000000001",
    email: "dev@corp.local",
    name: "dev",
    oidcSub: "local_dev@corp.local",
    disabled: false,
    companyUuid,
    company,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createLocalUser", () => {
  it("lowercases the email, derives the name, and stores a bcrypt hash (not the password)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue(makeLocalUser());

    await createLocalUser({
      companyUuid,
      email: "  Dev@Corp.LOCAL ",
      password: "hunter2hunter2",
    });

    const createArgs = mockPrisma.user.create.mock.calls[0][0];
    expect(createArgs.data.email).toBe("dev@corp.local");
    expect(createArgs.data.oidcSub).toBe("local_dev@corp.local");
    expect(createArgs.data.name).toBe("dev");
    expect(createArgs.data.passwordHash).not.toBe("hunter2hunter2");
    expect(
      bcrypt.compareSync("hunter2hunter2", createArgs.data.passwordHash)
    ).toBe(true);
  });

  it("uses the provided name when given", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue(makeLocalUser());

    await createLocalUser({
      companyUuid,
      email: "dev@corp.local",
      password: "hunter2hunter2",
      name: "  张三 ",
    });

    expect(mockPrisma.user.create.mock.calls[0][0].data.name).toBe("张三");
  });

  it("throws DuplicateLocalUserError when the email already exists in the company", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 7 });

    await expect(
      createLocalUser({
        companyUuid,
        email: "dev@corp.local",
        password: "hunter2hunter2",
      })
    ).rejects.toBeInstanceOf(DuplicateLocalUserError);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});

describe("authenticateLocalUser", () => {
  const passwordHash = bcrypt.hashSync("correct-horse", 4);

  it("returns ok with the user (hash stripped) for a correct password", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { ...makeLocalUser(), passwordHash },
    ]);

    const result = await authenticateLocalUser("DEV@corp.local", "correct-horse");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.user.uuid).toBe("user-0000-0000-0000-000000000001");
      expect("passwordHash" in result.user).toBe(false);
    }
    // Email must be normalized in the query
    expect(mockPrisma.user.findMany.mock.calls[0][0].where.email).toBe(
      "dev@corp.local"
    );
  });

  it("returns invalid for a wrong password", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { ...makeLocalUser(), passwordHash },
    ]);

    const result = await authenticateLocalUser("dev@corp.local", "wrong");
    expect(result.status).toBe("invalid");
  });

  it("returns disabled for a disabled account with the RIGHT password", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { ...makeLocalUser({ disabled: true }), passwordHash },
    ]);

    const result = await authenticateLocalUser("dev@corp.local", "correct-horse");
    expect(result.status).toBe("disabled");
  });

  it("returns invalid when no local account carries the email", async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    const result = await authenticateLocalUser("nobody@corp.local", "whatever");
    expect(result.status).toBe("invalid");
  });
});

describe("hasLocalUsers", () => {
  it("is true iff a user with a passwordHash exists", async () => {
    mockPrisma.user.count.mockResolvedValue(3);
    await expect(hasLocalUsers()).resolves.toBe(true);
    mockPrisma.user.count.mockResolvedValue(0);
    await expect(hasLocalUsers()).resolves.toBe(false);
  });
});

describe("resetUserPassword / setUserDisabled", () => {
  it("stores a new bcrypt hash on reset", async () => {
    mockPrisma.user.update.mockResolvedValue(makeLocalUser());

    await resetUserPassword("user-uuid", "new-password-1");

    const updateArgs = mockPrisma.user.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ uuid: "user-uuid" });
    expect(
      bcrypt.compareSync("new-password-1", updateArgs.data.passwordHash)
    ).toBe(true);
  });

  it("toggles the disabled flag", async () => {
    mockPrisma.user.update.mockResolvedValue(makeLocalUser({ disabled: true }));

    await setUserDisabled("user-uuid", true);

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: "user-uuid" },
        data: { disabled: true },
      })
    );
  });
});

describe("company registerCode helpers", () => {
  it("getCompanyByRegisterCode trims and rejects empty codes without a query", async () => {
    await expect(getCompanyByRegisterCode("   ")).resolves.toBeNull();
    expect(mockPrisma.company.findFirst).not.toHaveBeenCalled();
  });

  it("getCompanyByRegisterCode finds the company by exact code", async () => {
    mockPrisma.company.findFirst.mockResolvedValue(company);
    await expect(getCompanyByRegisterCode(" team-code ")).resolves.toEqual(company);
    expect(mockPrisma.company.findFirst.mock.calls[0][0].where).toEqual({
      registerCode: "team-code",
    });
  });

  it("isRegistrationOpen reflects whether any company has a code", async () => {
    mockPrisma.company.count.mockResolvedValue(1);
    await expect(isRegistrationOpen()).resolves.toBe(true);
    mockPrisma.company.count.mockResolvedValue(0);
    await expect(isRegistrationOpen()).resolves.toBe(false);
  });
});
