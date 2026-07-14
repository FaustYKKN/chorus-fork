// src/app/api/auth/register/route.ts
// Self-registration for local password accounts (fork feature).
//
// Gated by a per-Company invite code (Company.registerCode, set by the super
// admin). A valid code decides WHICH company the new account joins — email
// domains play no role here, so intranet users with arbitrary addresses all
// land in the team whose code they were given.

import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { errors } from "@/lib/api-response";
import {
  createUserAccessToken,
  UserSessionPayload,
} from "@/lib/user-session";
import { getCookieOptions } from "@/lib/cookie-utils";
import {
  createLocalUser,
  DuplicateLocalUserError,
} from "@/services/user.service";
import { getCompanyByRegisterCode } from "@/services/company.service";

const MIN_PASSWORD_LENGTH = 8;
// Deliberately loose — just enough to reject obvious non-addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RegisterRequest {
  inviteCode: string;
  email: string;
  password: string;
  name?: string;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const body = await parseBody<RegisterRequest>(request);

  if (!body.inviteCode || typeof body.inviteCode !== "string" || !body.inviteCode.trim()) {
    return errors.validationError({ inviteCode: "Invite code is required" });
  }
  if (!body.email || typeof body.email !== "string" || !EMAIL_PATTERN.test(body.email.trim())) {
    return errors.validationError({ email: "A valid email is required" });
  }
  if (
    !body.password ||
    typeof body.password !== "string" ||
    body.password.length < MIN_PASSWORD_LENGTH
  ) {
    return errors.validationError({
      password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  }

  const company = await getCompanyByRegisterCode(body.inviteCode);
  if (!company) {
    // Same message for "no such code" and "registration closed" — the code is
    // the only credential here, so don't reveal which case it was.
    return errors.unauthorized("Invalid invite code");
  }

  let user;
  try {
    user = await createLocalUser({
      companyUuid: company.uuid,
      email: body.email,
      password: body.password,
      name: typeof body.name === "string" ? body.name : undefined,
    });
  } catch (e) {
    if (e instanceof DuplicateLocalUserError) {
      return errors.validationError({ email: "This email is already registered" });
    }
    throw e;
  }

  // Log the new account straight in (same long-lived local session as
  // default-login — these accounts exist for intranet pilots).
  const sessionPayload: UserSessionPayload = {
    type: "user",
    userUuid: user.uuid,
    companyUuid: user.companyUuid,
    email: user.email ?? body.email.trim().toLowerCase(),
    name: user.name ?? undefined,
    oidcSub: user.oidcSub,
  };

  const accessToken = await createUserAccessToken(sessionPayload, "365d");

  const response = NextResponse.json({
    success: true,
    data: {
      user: {
        uuid: user.uuid,
        email: user.email,
        name: user.name,
        companyUuid: user.companyUuid,
        companyName: user.company.name,
      },
      redirectTo: "/onboarding",
    },
  });

  response.cookies.set("user_session", accessToken, getCookieOptions(365 * 24 * 60 * 60));

  return response;
});
