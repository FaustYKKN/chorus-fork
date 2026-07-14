// src/services/user.service.ts
// User service for OIDC-authenticated users and local password accounts
// UUID-Based Architecture: All operations use UUIDs

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const BCRYPT_ROUNDS = 10;

// oidcSub convention for local password accounts (no IdP involved). Keeps the
// @@unique([companyUuid, oidcSub]) constraint doing double duty as
// "one local account per email per company".
function localOidcSub(email: string): string {
  return `local_${email.toLowerCase()}`;
}

// User creation/update input from OIDC
export interface OidcUserInput {
  oidcSub: string;
  email: string;
  name?: string;
  companyUuid: string;
}

// Find or create user by OIDC subject
export async function findOrCreateUserByOidc(input: OidcUserInput) {
  const { oidcSub, email, name, companyUuid } = input;

  // First try to find existing user by OIDC subject in this company
  let user = await prisma.user.findFirst({
    where: {
      oidcSub,
      companyUuid,
    },
    select: {
      id: true,
      uuid: true,
      email: true,
      name: true,
      oidcSub: true,
      companyUuid: true,
      company: {
        select: {
          uuid: true,
          name: true,
        },
      },
    },
  });

  if (user) {
    // Update user info if changed
    if (user.email !== email || user.name !== name) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { email, name },
        select: {
          id: true,
          uuid: true,
          email: true,
          name: true,
          oidcSub: true,
          companyUuid: true,
          company: {
            select: {
              uuid: true,
              name: true,
            },
          },
        },
      });
    }
    return user;
  }

  // Check if user exists by email (might have been pre-created)
  const existingByEmail = await prisma.user.findFirst({
    where: {
      email,
      companyUuid,
    },
  });

  if (existingByEmail) {
    // Link OIDC subject to existing user
    return prisma.user.update({
      where: { id: existingByEmail.id },
      data: { oidcSub, name },
      select: {
        id: true,
        uuid: true,
        email: true,
        name: true,
        oidcSub: true,
        companyUuid: true,
        company: {
          select: {
            uuid: true,
            name: true,
          },
        },
      },
    });
  }

  // Create new user
  return prisma.user.create({
    data: {
      email,
      name,
      oidcSub,
      companyUuid,
    },
    select: {
      id: true,
      uuid: true,
      email: true,
      name: true,
      oidcSub: true,
      companyUuid: true,
      company: {
        select: {
          uuid: true,
          name: true,
        },
      },
    },
  });
}

// Find or create user for default auth (auto-provision company + user)
export async function findOrCreateDefaultUser(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) {
    throw new Error("Invalid email: no domain");
  }

  // Look for company by email domain (without requiring oidcEnabled)
  let company = await prisma.company.findFirst({
    where: {
      emailDomains: {
        has: domain,
      },
    },
    select: {
      id: true,
      uuid: true,
      name: true,
    },
  });

  // If no company, create one
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: domain,
        emailDomains: [domain],
        oidcEnabled: false,
      },
      select: {
        id: true,
        uuid: true,
        name: true,
      },
    });
  }

  const oidcSub = `default_${email.toLowerCase()}`;
  const userSelect = {
    id: true,
    uuid: true,
    email: true,
    name: true,
    oidcSub: true,
    companyUuid: true,
    company: {
      select: {
        uuid: true,
        name: true,
      },
    },
  } as const;

  // Upsert to handle concurrent requests safely
  const user = await prisma.user.upsert({
    where: {
      companyUuid_oidcSub: {
        companyUuid: company.uuid,
        oidcSub,
      },
    },
    update: {
      email,
    },
    create: {
      email,
      name: email.split("@")[0],
      oidcSub,
      companyUuid: company.uuid,
    },
    select: userSelect,
  });

  return user;
}

// Get user by UUID with company info
export async function getUserByUuid(userUuid: string) {
  return prisma.user.findUnique({
    where: { uuid: userUuid },
    select: {
      id: true,
      uuid: true,
      email: true,
      name: true,
      oidcSub: true,
      disabled: true,
      companyUuid: true,
      company: {
        select: {
          uuid: true,
          name: true,
          oidcIssuer: true,
          oidcClientId: true,
        },
      },
    },
  });
}

// Get company by UUID (for OIDC callback)
export async function getCompanyByUuid(uuid: string) {
  return prisma.company.findFirst({
    where: { uuid },
    select: {
      id: true,
      uuid: true,
      name: true,
      oidcIssuer: true,
      oidcClientId: true,
      oidcEnabled: true,
    },
  });
}

// ===================================================================
// Local password accounts (fork feature)
//
// Chorus upstream only knows OIDC users plus a single env-configured
// default-auth account. For intranet deployments without any IdP, this fork
// adds DB-backed password accounts: created via self-registration (Company
// registerCode) or by the super admin panel, authenticated by the same
// /api/auth/default-login route (DB checked before the env fallback).
// ===================================================================

const localUserSelect = {
  id: true,
  uuid: true,
  email: true,
  name: true,
  oidcSub: true,
  disabled: true,
  companyUuid: true,
  company: {
    select: {
      uuid: true,
      name: true,
    },
  },
} as const;

export class DuplicateLocalUserError extends Error {
  constructor(email: string) {
    super(`A local account already exists for ${email}`);
    this.name = "DuplicateLocalUserError";
  }
}

export interface CreateLocalUserInput {
  companyUuid: string;
  email: string;
  password: string;
  name?: string;
}

// Create a local password account inside an existing Company.
// Email is normalized to lowercase; uniqueness is per (company, email) via the
// local_<email> oidcSub unique constraint.
export async function createLocalUser(input: CreateLocalUserInput) {
  const email = input.email.trim().toLowerCase();
  const oidcSub = localOidcSub(email);

  const existing = await prisma.user.findFirst({
    where: { companyUuid: input.companyUuid, OR: [{ oidcSub }, { email }] },
    select: { id: true },
  });
  if (existing) {
    throw new DuplicateLocalUserError(email);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  return prisma.user.create({
    data: {
      email,
      name: input.name?.trim() || email.split("@")[0],
      oidcSub,
      companyUuid: input.companyUuid,
      passwordHash,
    },
    select: localUserSelect,
  });
}

export type LocalAuthResult =
  | { status: "ok"; user: NonNullable<Awaited<ReturnType<typeof createLocalUser>>> }
  | { status: "disabled" }
  | { status: "invalid" };

// Authenticate a local password account by email + password.
// "invalid" covers both unknown email and wrong password (no oracle).
export async function authenticateLocalUser(
  email: string,
  password: string
): Promise<LocalAuthResult> {
  const normalized = email.trim().toLowerCase();

  // Email is not globally unique (multi-tenant), so compare against every
  // local account carrying this email. In practice there is one.
  const candidates = await prisma.user.findMany({
    where: { email: normalized, passwordHash: { not: null } },
    orderBy: { id: "asc" },
    select: { ...localUserSelect, passwordHash: true },
  });

  for (const candidate of candidates) {
    if (!candidate.passwordHash) continue;
    const match = await bcrypt.compare(password, candidate.passwordHash);
    if (!match) continue;
    if (candidate.disabled) {
      return { status: "disabled" };
    }
    // Never let the hash escape the service layer.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _passwordHash, ...user } = candidate;
    return { status: "ok", user };
  }

  return { status: "invalid" };
}

// Whether any local password account exists (drives the login form visibility
// when the env default-auth pair is not configured).
export async function hasLocalUsers(): Promise<boolean> {
  const count = await prisma.user.count({
    where: { passwordHash: { not: null } },
  });
  return count > 0;
}

// ===== Super admin user management =====

export interface ListUsersParams {
  companyUuid?: string;
  skip: number;
  take: number;
}

export async function listUsers({ companyUuid, skip, take }: ListUsersParams) {
  const where = companyUuid ? { companyUuid } : {};
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { id: "desc" },
      skip,
      take,
      select: { ...localUserSelect, passwordHash: true, createdAt: true },
    }),
    prisma.user.count({ where }),
  ]);

  // Expose only WHETHER a password exists, never the hash.
  const users = rows.map(({ passwordHash, ...user }) => ({
    ...user,
    hasPassword: passwordHash != null,
  }));

  return { users, total };
}

// Set (or reset) the password of any user, converting an OIDC-only user into
// one that can also log in locally. Super admin only.
export async function resetUserPassword(userUuid: string, password: string) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return prisma.user.update({
    where: { uuid: userUuid },
    data: { passwordHash },
    select: localUserSelect,
  });
}

// Enable/disable a user. Disabled users cannot log in locally and their
// existing sessions die on the next /api/session probe.
export async function setUserDisabled(userUuid: string, disabled: boolean) {
  return prisma.user.update({
    where: { uuid: userUuid },
    data: { disabled },
    select: localUserSelect,
  });
}

export async function updateUserName(userUuid: string, name: string) {
  return prisma.user.update({
    where: { uuid: userUuid },
    data: { name: name.trim() },
    select: localUserSelect,
  });
}
