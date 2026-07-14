// src/lib/errors.ts
// Business error classes for domain-specific error handling

export class AlreadyClaimedError extends Error {
  constructor(entity: string) {
    super(`${entity} is already claimed`);
    this.name = "AlreadyClaimedError";
  }
}

export class NotClaimedError extends Error {
  constructor(entity: string) {
    super(`${entity} is not currently claimed`);
    this.name = "NotClaimedError";
  }
}

// Agent-ownership isolation (fork): an assignment to an agent (or an
// instance-pinned assignment) was attempted by a principal who does not OWN the
// target agent. Thrown by the claimTask/assignIdea chokepoint guard; mapped to
// 403 in REST routes and to an isError result in MCP tools. See
// docs/specs/agent-ownership-isolation.md.
export class AssignmentNotOwnedError extends Error {
  constructor() {
    super(
      "You can only assign work to your OWN agents (machines). This agent belongs to someone else — assign the task to that person instead, and let them run it on their own machine.",
    );
    this.name = "AssignmentNotOwnedError";
  }
}

export function isPrismaNotFound(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  );
}
