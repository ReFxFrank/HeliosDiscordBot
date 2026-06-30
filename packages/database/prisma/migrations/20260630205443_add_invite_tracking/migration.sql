-- CreateTable
CREATE TABLE "InviteUse" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "inviterId" TEXT,
    "invitedUserId" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InviteUse_guildId_inviterId_idx" ON "InviteUse"("guildId", "inviterId");

-- CreateIndex
CREATE INDEX "InviteUse_guildId_idx" ON "InviteUse"("guildId");

-- AddForeignKey
ALTER TABLE "InviteUse" ADD CONSTRAINT "InviteUse_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
