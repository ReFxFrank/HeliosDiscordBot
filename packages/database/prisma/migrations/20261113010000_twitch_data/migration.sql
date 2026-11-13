-- AlterTable
ALTER TABLE "Guild" ADD COLUMN "twitchQuoteCounter" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TwitchQuote" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "game" TEXT,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwitchQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwitchCounter" (
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwitchCounter_pkey" PRIMARY KEY ("guildId","name")
);

-- CreateTable
CREATE TABLE "TwitchModLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userLogin" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "actor" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwitchModLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwitchSongRequest" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playedAt" TIMESTAMP(3),

    CONSTRAINT "TwitchSongRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TwitchQuote_guildId_number_key" ON "TwitchQuote"("guildId", "number");

-- CreateIndex
CREATE INDEX "TwitchModLog_guildId_createdAt_idx" ON "TwitchModLog"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "TwitchSongRequest_guildId_status_createdAt_idx" ON "TwitchSongRequest"("guildId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "TwitchQuote" ADD CONSTRAINT "TwitchQuote_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwitchCounter" ADD CONSTRAINT "TwitchCounter_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwitchModLog" ADD CONSTRAINT "TwitchModLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwitchSongRequest" ADD CONSTRAINT "TwitchSongRequest_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
