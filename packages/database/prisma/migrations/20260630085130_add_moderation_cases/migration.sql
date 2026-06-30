-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('WARN', 'MUTE', 'KICK', 'BAN', 'SOFTBAN', 'TEMPBAN', 'UNBAN', 'NOTE');

-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "caseCounter" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "type" "CaseType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT,
    "duration" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_idx" ON "ModerationCase"("guildId");

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_targetId_idx" ON "ModerationCase"("guildId", "targetId");

-- CreateIndex
CREATE INDEX "ModerationCase_active_expiresAt_idx" ON "ModerationCase"("active", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationCase_guildId_caseNumber_key" ON "ModerationCase"("guildId", "caseNumber");

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
