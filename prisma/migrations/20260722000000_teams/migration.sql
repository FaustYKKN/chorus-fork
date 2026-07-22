-- Teams (ProjectGroup as a team: owner + members). See docs/specs/team-scoping.md.

-- AlterTable: team owner (creator / lead). Nullable for legacy rows; backfilled below.
ALTER TABLE "ProjectGroup" ADD COLUMN     "ownerUuid" TEXT;

-- CreateTable: team membership (many-to-many user <-> team)
CREATE TABLE "TeamMember" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "groupUuid" TEXT NOT NULL,
    "userUuid" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_uuid_key" ON "TeamMember"("uuid");
CREATE UNIQUE INDEX "TeamMember_groupUuid_userUuid_key" ON "TeamMember"("groupUuid", "userUuid");
CREATE INDEX "TeamMember_groupUuid_idx" ON "TeamMember"("groupUuid");
CREATE INDEX "TeamMember_userUuid_idx" ON "TeamMember"("userUuid");
CREATE INDEX "TeamMember_companyUuid_idx" ON "TeamMember"("companyUuid");
CREATE INDEX "ProjectGroup_ownerUuid_idx" ON "ProjectGroup"("ownerUuid");

-- ---------------------------------------------------------------------------
-- Backfill (decision b): existing groups become teams whose owner is the
-- company's earliest user (the de-facto admin) and whose members are ALL current
-- company users — so nobody loses visibility on cutover (P2 keys visibility off
-- TeamMember). Owners then trim membership. No-op when there are no groups/users.
-- ---------------------------------------------------------------------------
UPDATE "ProjectGroup" g
SET "ownerUuid" = (
  SELECT u."uuid" FROM "User" u
  WHERE u."companyUuid" = g."companyUuid"
  ORDER BY u."id" ASC LIMIT 1
)
WHERE g."ownerUuid" IS NULL;

INSERT INTO "TeamMember" ("uuid", "companyUuid", "groupUuid", "userUuid", "role", "createdAt")
SELECT gen_random_uuid()::text, g."companyUuid", g."uuid", u."uuid",
       CASE WHEN u."uuid" = g."ownerUuid" THEN 'owner' ELSE 'member' END,
       CURRENT_TIMESTAMP
FROM "ProjectGroup" g
JOIN "User" u ON u."companyUuid" = g."companyUuid"
WHERE g."ownerUuid" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TeamMember" tm
    WHERE tm."groupUuid" = g."uuid" AND tm."userUuid" = u."uuid"
  );
