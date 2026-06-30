-- CreateIndex
CREATE UNIQUE INDEX "InviteUse_guildId_invitedUserId_key" ON "InviteUse"("guildId", "invitedUserId");
