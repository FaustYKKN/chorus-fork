-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "registerCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_registerCode_key" ON "Company"("registerCode");

