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

// Entity-direct route guards: resolve the entity's project, then reuse the
// project gate. 404 (not 403) whether the entity is missing or in a hidden team.
export async function requireTaskAccess(
  auth: AuthContext,
  taskUuid: string
): Promise<ReturnType<typeof errors.notFound> | null> {
  const task = await prisma.task.findFirst({
    where: { uuid: taskUuid, companyUuid: auth.companyUuid },
    select: { projectUuid: true },
  });
  if (!task) return errors.notFound("Task");
  return requireProjectAccess(auth, task.projectUuid);
}

export async function requireIdeaAccess(
  auth: AuthContext,
  ideaUuid: string
): Promise<ReturnType<typeof errors.notFound> | null> {
  const idea = await prisma.idea.findFirst({
    where: { uuid: ideaUuid, companyUuid: auth.companyUuid },
    select: { projectUuid: true },
  });
  if (!idea) return errors.notFound("Idea");
  return requireProjectAccess(auth, idea.projectUuid);
}

export async function requireProposalAccess(
  auth: AuthContext,
  proposalUuid: string
): Promise<ReturnType<typeof errors.notFound> | null> {
  const proposal = await prisma.proposal.findFirst({
    where: { uuid: proposalUuid, companyUuid: auth.companyUuid },
    select: { projectUuid: true },
  });
  if (!proposal) return errors.notFound("Proposal");
  return requireProjectAccess(auth, proposal.projectUuid);
}

export async function requireDocumentAccess(
  auth: AuthContext,
  documentUuid: string
): Promise<ReturnType<typeof errors.notFound> | null> {
  const doc = await prisma.document.findFirst({
    where: { uuid: documentUuid, companyUuid: auth.companyUuid },
    select: { projectUuid: true },
  });
  if (!doc) return errors.notFound("Document");
  return requireProjectAccess(auth, doc.projectUuid);
}

// Route guard for team-scoped surfaces (team detail / dashboard): only members
// may see a team (R1). 404 — don't reveal a team you're not in.
export async function requireTeamMembership(
  auth: AuthContext,
  groupUuid: string
): Promise<ReturnType<typeof errors.notFound> | null> {
  const viewer = await resolveViewerUserUuid(auth);
  if (!viewer) return errors.notFound("Team");
  const member = await prisma.teamMember.findFirst({
    where: { companyUuid: auth.companyUuid, groupUuid, userUuid: viewer },
  });
  return member ? null : errors.notFound("Team");
}

// Route guard for team management (rename, member changes): owner only (R5).
// 404 for non-members (don't reveal), 403 for members who aren't the owner.
export async function requireTeamOwner(
  auth: AuthContext,
  groupUuid: string
): Promise<ReturnType<typeof errors.notFound> | null> {
  const viewer = await resolveViewerUserUuid(auth);
  if (!viewer) return errors.notFound("Team");
  const row = await prisma.teamMember.findFirst({
    where: { companyUuid: auth.companyUuid, groupUuid, userUuid: viewer },
  });
  if (!row) return errors.notFound("Team");
  if (row.role !== "owner") return errors.forbidden("Only the team owner can manage the team");
  return null;
}

// Is the viewer a member of this team? (target-team check for project moves, R6)
export async function isViewerTeamMember(
  auth: AuthContext,
  groupUuid: string
): Promise<boolean> {
  const viewer = await resolveViewerUserUuid(auth);
  if (!viewer) return false;
  const row = await prisma.teamMember.findFirst({
    where: { companyUuid: auth.companyUuid, groupUuid, userUuid: viewer },
  });
  return row !== null;
}
