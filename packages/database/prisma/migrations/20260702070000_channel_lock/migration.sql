-- CreateTable
CREATE TABLE "ChannelLock" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT,
    "prevState" TEXT NOT NULL,
    "bulk" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelLock_guildId_idx" ON "ChannelLock"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelLock_guildId_channelId_key" ON "ChannelLock"("guildId", "channelId");

-- AddForeignKey
ALTER TABLE "ChannelLock" ADD CONSTRAINT "ChannelLock_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
