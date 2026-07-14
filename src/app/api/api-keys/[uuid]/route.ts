// src/app/api/api-keys/[uuid]/route.ts
// API Keys API - Revoke (ARCHITECTURE.md §5.1, §9.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// DELETE /api/api-keys/[uuid] - Revoke API Key
export const DELETE = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // Only users can revoke API Keys
    if (!isUser(auth)) {
      return errors.forbidden("Only users can revoke API keys");
    }

    const { uuid } = await context.params;

    const apiKey = await prisma.apiKey.findFirst({
      where: { uuid, companyUuid: auth.companyUuid },
      select: { uuid: true, revokedAt: true, agentUuid: true },
    });

    if (!apiKey) {
      return errors.notFound("API Key");
    }

    // Ownership isolation (fork: agent-ownership-isolation): only the owner of
    // the key's agent may revoke it — otherwise a teammate could knock another
    // person's machine offline (DoS). A key on a foreign agent resolves to 404
    // (non-disclosure), same as if it did not exist.
    const ownedAgent = await prisma.agent.findFirst({
      where: {
        uuid: apiKey.agentUuid,
        companyUuid: auth.companyUuid,
        ownerUuid: auth.actorUuid,
      },
      select: { uuid: true },
    });
    if (!ownedAgent) {
      return errors.notFound("API Key");
    }

    if (apiKey.revokedAt) {
      return errors.badRequest("API Key is already revoked");
    }

    await prisma.apiKey.update({
      where: { uuid: apiKey.uuid },
      data: { revokedAt: new Date() },
    });

    return success({ revoked: true });
  }
);
