// src/app/api/project-groups/[uuid]/members/[userUuid]/route.ts
// Team member removal (owner-only; the owner cannot be removed).

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { removeTeamMember } from "@/services/project-group.service";

// DELETE /api/project-groups/[uuid]/members/[userUuid]
export const DELETE = withErrorHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ uuid: string; userUuid: string }> }
  ) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only the team owner can manage members");

    const { uuid, userUuid } = await context.params;
    const result = await removeTeamMember(auth.companyUuid, auth.actorUuid, uuid, userUuid);
    if (!result.ok) {
      if (result.reason === "not_found") return errors.notFound("Member");
      if (result.reason === "forbidden") return errors.forbidden(result.message);
      return errors.badRequest(result.message);
    }
    return success({ ok: true });
  }
);
