-- CreateTable
CREATE TABLE "CustomBot" (
    "guildId" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "applicationId" TEXT,
    "botName" TEXT,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'online',
    "activityType" TEXT,
    "activityText" TEXT,
    "streamUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomBot_pkey" PRIMARY KEY ("guildId")
);

-- AddForeignKey
ALTER TABLE "CustomBot" ADD CONSTRAINT "CustomBot_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
