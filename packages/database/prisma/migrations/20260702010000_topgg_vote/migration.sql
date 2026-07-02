-- CreateTable
CREATE TABLE "TopggVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isWeekend" BOOLEAN NOT NULL DEFAULT false,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedGuilds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "TopggVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopggVote_userId_votedAt_idx" ON "TopggVote"("userId", "votedAt");
