// src/lib/assignment-ownership.ts
// Agent-ownership isolation guard (fork feature).
//
// Chorus's "wake" is platform-issued remote code execution: assigning/pinning a
// task or idea to an agent wakes that developer's local opencode and lets it
// read/write files and run commands on their machine. Upstream fences this only
// by COMPANY — so any teammate can drive any other teammate's machine.
//
// This module is the single ownership fence used by the two assignment
// chokepoints (task.service.claimTask and idea.service.assignIdea): work may be
// assigned to an agent ONLY by that agent's owner (the machine's owner). A user
// owns their agents; an agent (e.g. a PM agent) shares its owner's reach, so a
// PM can orchestrate its owner's OTHER agents but never a different person's.
// Cross-person collaboration goes through assigning to the PERSON instead, who
// then claims it on their own machine.
//
// See docs/specs/agent-ownership-isolation.md.

import { prisma } from "@/lib/prisma";
import { AssignmentNotOwnedError } from "@/lib/errors";
import { resolveAssigneeAgentUuid } from "@/lib/uuid-resolver";

/**
 * Resolve an actor uuid (a User or an Agent) to its OWNER uuid — the isolation
 * principal that assignment reachability is compared on.
 *   - a User      → its own uuid (a person owns themselves)
 *   - an Agent    → its `ownerUuid` (the person who created the machine binding)
 *   - unknown/instance uuid / null → null
 * companyUuid-scoped. A null result means "no resolvable owner" and, on the
 * target side, is treated as fail-closed by the guard below.
 */
export async function resolveOwnerUuid(
  companyUuid: string,
  actorUuid: string | null | undefined,
): Promise<string | null> {
  if (!actorUuid) return null;

  const user = await prisma.user.findFirst({
    where: { uuid: actorUuid, companyUuid },
    select: { uuid: true },
  });
  if (user) return user.uuid;

  const agent = await prisma.agent.findFirst({
    where: { uuid: actorUuid, companyUuid },
    select: { ownerUuid: true },
  });
  if (agent) return agent.ownerUuid ?? null;

  return null;
}

/**
 * The chokepoint guard. Given a RESOLVED assignment (its final
 * assigneeType/assigneeUuid, AFTER any instance-pin resolution) and the actor
 * doing the assigning, throw AssignmentNotOwnedError unless the assigner and the
 * target agent share the same owner.
 *
 * Pass the RESOLVED assignee so a pin to a foreign machine is caught even when
 * the caller named their own agent in assigneeUuid (the pin overrides it to an
 * agent_instance of someone else's agent). Pass the ORIGINAL assigner uuid
 * (`assignedByUuid ?? original assigneeUuid`): a self-claim carries no
 * assignedByUuid, so it falls back to the claiming agent itself — which owns the
 * target trivially and therefore always passes.
 *
 * Non-agent assignments (assigneeType "user"/null) are not fenced — assigning to
 * a PERSON never drives a machine.
 */
export async function assertAgentAssignmentOwnership(params: {
  companyUuid: string;
  resolvedAssigneeType: string;
  resolvedAssigneeUuid: string;
  assignerActorUuid: string | null | undefined;
}): Promise<void> {
  const { companyUuid, resolvedAssigneeType, resolvedAssigneeUuid, assignerActorUuid } = params;

  const targetAgentUuid = await resolveAssigneeAgentUuid(
    companyUuid,
    resolvedAssigneeType,
    resolvedAssigneeUuid,
  );
  // Not an agent assignment (user / unresolvable) → nothing to fence.
  if (!targetAgentUuid) return;

  const agent = await prisma.agent.findFirst({
    where: { uuid: targetAgentUuid, companyUuid },
    select: { ownerUuid: true },
  });
  const targetOwner = agent?.ownerUuid ?? null;

  // Fail-closed: an agent with no owner (legacy/unmigrated) is assignable by
  // nobody until it is claimed by a real owner. Prevents an orphan machine from
  // being a free-for-all wake target.
  if (!targetOwner) {
    throw new AssignmentNotOwnedError();
  }

  const assignerOwner = await resolveOwnerUuid(companyUuid, assignerActorUuid);
  if (assignerOwner !== targetOwner) {
    throw new AssignmentNotOwnedError();
  }
}
