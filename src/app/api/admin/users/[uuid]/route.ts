// src/app/api/admin/users/[uuid]/route.ts
// User Update API (Super Admin Only) — fork feature.
// PATCH accepts any subset of: password (reset), disabled (toggle), name.

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { requireSuperAdmin } from "@/lib/auth";
import * as userService from "@/services/user.service";
import { AdminUserUpdateInput } from "@/types/admin";

const MIN_PASSWORD_LENGTH = 8;

type RouteContext = { params: Promise<{ uuid: string }> };

export const PATCH = withErrorHandler<{ uuid: string }>(
  requireSuperAdmin(async (request: NextRequest, context: RouteContext) => {
    const { uuid } = await context.params;

    const user = await userService.getUserByUuid(uuid);
    if (!user) {
      return errors.notFound("User");
    }

    const body = await parseBody<AdminUserUpdateInput>(request);

    if (
      body.password === undefined &&
      body.disabled === undefined &&
      body.name === undefined
    ) {
      return errors.badRequest("Nothing to update");
    }

    if (body.password !== undefined) {
      if (typeof body.password !== "string" || body.password.length < MIN_PASSWORD_LENGTH) {
        return errors.validationError({
          password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        });
      }
      await userService.resetUserPassword(uuid, body.password);
    }

    if (body.disabled !== undefined) {
      if (typeof body.disabled !== "boolean") {
        return errors.validationError({ disabled: "Must be a boolean" });
      }
      await userService.setUserDisabled(uuid, body.disabled);
    }

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return errors.validationError({ name: "Name cannot be empty" });
      }
      await userService.updateUserName(uuid, body.name);
    }

    const updated = await userService.getUserByUuid(uuid);
    return success({
      uuid: updated?.uuid,
      email: updated?.email,
      name: updated?.name,
      disabled: updated?.disabled,
    });
  })
);
