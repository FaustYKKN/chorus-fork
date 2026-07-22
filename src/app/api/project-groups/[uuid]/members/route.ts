// src/app/api/project-groups/[uuid]/members/route.ts
// Team members — list, and (owner-only) add. See docs/specs/team-scoping.md.

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import {
  listTeamMembers,
  addTeamMember,
  type TeamMutationResult,
} from "@/services/project-group.service";

function mapFailure(result: Extract<TeamMutationResult, { ok: false }>) {
  switch (result.reason) {
    case "not_found":
      return errors.notFound("Team");
    case "forbidden":
      return errors.forbidden(result.message);
    default: // "conflict" | "invalid"
      return errors.badRequest(result.message);
  }
}

// GET /api/project-groups/[uuid]/members — list members of a team
export const GET = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ uuid: string }> }) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();

    const { uuid } = await context.params;
    const members = await listTeamMembers(auth.companyUuid, uuid);
    return success({ members });
  }
);

// POST /api/project-groups/[uuid]/members — owner adds a company user to the team
export const POST = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ uuid: string }> }) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only the team owner can manage members");

    const { uuid } = await context.params;
    const body = await parseBody<{ userUuid?: string }>(request);
    if (!body.userUuid) return errors.validationError({ userUuid: "userUuid is required" });

    const result = await addTeamMember(auth.companyUuid, auth.actorUuid, uuid, body.userUuid);
    if (!result.ok) return mapFailure(result);
    return success({ ok: true });
  }
);
