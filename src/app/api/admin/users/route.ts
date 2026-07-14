// src/app/api/admin/users/route.ts
// User List and Create API (Super Admin Only) — fork feature.
// Lets the super admin see every human user and create local password
// accounts without going through self-registration.

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody, parsePagination, parseQuery } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { requireSuperAdmin } from "@/lib/auth";
import * as userService from "@/services/user.service";
import * as companyService from "@/services/company.service";
import { AdminUserCreateInput } from "@/types/admin";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/admin/users - List (optionally filtered by ?companyUuid=)
export const GET = withErrorHandler(
  requireSuperAdmin(async (request: NextRequest) => {
    const { page, pageSize, skip, take } = parsePagination(request);
    const query = parseQuery(request);

    const { users, total } = await userService.listUsers({
      companyUuid: query.companyUuid || undefined,
      skip,
      take,
    });

    const data = users.map((u) => ({
      uuid: u.uuid,
      email: u.email,
      name: u.name,
      disabled: u.disabled,
      hasPassword: u.hasPassword,
      createdAt: u.createdAt.toISOString(),
      company: u.company,
    }));

    return paginated(data, page, pageSize, total);
  })
);

// POST /api/admin/users - Create a local password account
export const POST = withErrorHandler(
  requireSuperAdmin(async (request: NextRequest) => {
    const body = await parseBody<AdminUserCreateInput>(request);

    if (!body.companyUuid || typeof body.companyUuid !== "string") {
      return errors.validationError({ companyUuid: "Company is required" });
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

    const company = await companyService.getCompanyByUuid(body.companyUuid);
    if (!company) {
      return errors.notFound("Company");
    }

    try {
      const user = await userService.createLocalUser({
        companyUuid: body.companyUuid,
        email: body.email,
        password: body.password,
        name: typeof body.name === "string" ? body.name : undefined,
      });

      return success({
        uuid: user.uuid,
        email: user.email,
        name: user.name,
        disabled: user.disabled,
        hasPassword: true,
        company: user.company,
      });
    } catch (e) {
      if (e instanceof userService.DuplicateLocalUserError) {
        return errors.validationError({ email: "This email is already registered in that company" });
      }
      throw e;
    }
  })
);
