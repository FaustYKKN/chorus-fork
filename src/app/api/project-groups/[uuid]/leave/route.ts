// src/app/api/project-groups/[uuid]/leave/route.ts
// A member leaves a team themselves. The owner cannot leave (R5.1).

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { leaveTeam } from "@/services/project-group.service";

// POST /api/project-groups/[uuid]/leave
export const POST = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ uuid: string }> }) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can leave a team");

    const { uuid } = await context.params;
    const result = await leaveTeam(auth.companyUuid, auth.actorUuid, uuid);
    if (!result.ok) {
      if (result.reason === "not_found") return errors.notFound("Membership");
      if (result.reason === "forbidden") return errors.forbidden(result.message);
      return errors.badRequest(result.message);
    }
    return success({ ok: true });
  }
);
