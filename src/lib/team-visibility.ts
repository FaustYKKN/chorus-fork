// Team-scoped visibility (P2). See docs/specs/team-scoping.md.
//
// A user sees a project iff it is team-less (`groupUuid = null`, i.e. company-wide)
// OR they are a member of its team. Everything under a project (tasks, ideas,
// documents, proposals, activity) inherits the project's visibility. An agent
// sees what its OWNER sees (R9). Super admin has no company context and is not
// subject to this.
//
// Migration (b) made every existing user a member of every existing team, so
// enabling this hides nothing that was previously visible — only NEW teams
// isolate.

import { prisma } from "@/lib/prisma";
import { isUser, isAgent } from "@/lib/auth";
import { errors } from "@/lib/api-response";
import type { AuthContext } from "@/types/auth";

// The user whose team membership decides visibility for this request.
// User → themselves; Agent → its owner; anything else (e.g. super admin) → null.
export async function resolveViewerUserUuid(auth: AuthContext): Promise<string | null> {
  if (isUser(auth)) return auth.actorUuid;
  if (isAgent(auth)) {
    const agent = await prisma.agent.findFirst({
      where: { uuid: auth.actorUuid, companyUuid: auth.companyUuid },
      select: { ownerUuid: true },
    });
    return agent?.ownerUuid ?? null;
  }
  return null;
}

export async function getMemberTeamUuids(
  companyUuid: string,
  userUuid: string
): Promise<string[]> {
  const rows = await prisma.teamMember.findMany({
    where: { companyUuid, userUuid },
    select: { groupUuid: true },
  });
  return rows.map((r) => r.groupUuid);
}

// A Prisma `where` fragment restricting Project to those visible to a user with
// the given member-team set. Spread into a project query's `where`.
export function projectVisibilityWhere(memberTeamUuids: string[]) {
  return {
    OR: [{ groupUuid: null }, { groupUuid: { in: memberTeamUuids } }],
  };
}

// UUIDs of every project the user may see (company-wide + their teams').
export async function getVisibleProjectUuids(
  companyUuid: string,
  userUuid: string
): Promise<string[]> {
  const teams = await getMemberTeamUuids(companyUuid, userUuid);
  const projects = await prisma.project.findMany({
    where: { companyUuid, ...projectVisibilityWhere(teams) },
    select: { uuid: true },
  });
  return projects.map((p) => p.uuid);
}

// Can this viewer see this specific project? (team-less, or a member of its team)
// A null viewer (e.g. an owner-less agent) can only see company-wide projects.
export async function canAccessProject(
  companyUuid: string,
  userUuid: string | null,
  projectUuid: string
): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: { uuid: projectUuid, companyUuid },
    select: { groupUuid: true },
  });
  if (!project) return false;
  if (project.groupUuid === null) return true; // company-wide
  if (!userUuid) return false; // no viewer → cannot be a team member
  const member = await prisma.teamMember.findFirst({
    where: { companyUuid, groupUuid: project.groupUuid, userUuid },
  });
  return member !== null;
}

// Route guard: 404 (not 403 — don't reveal existence) when the caller may not
// see the project. Returns null when access is allowed. Super admin isn't routed
// here (no company context), so we treat every caller as team-scoped.
export async function requireProjectAccess(
  auth: AuthContext,
  projectUuid: string
): Promise<ReturnType<typeof errors.notFound> | null> {
  const viewer = await resolveViewerUserUuid(auth);
  const ok = await canAccessProject(auth.companyUuid, viewer, projectUuid);
  return ok ? null : errors.notFound("Project");
}
