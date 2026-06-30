-- CreateTable
CREATE TABLE "Birthday" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "year" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Birthday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Birthday_guildId_month_day_idx" ON "Birthday"("guildId", "month", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Birthday_guildId_userId_key" ON "Birthday"("guildId", "userId");

-- AddForeignKey
ALTER TABLE "Birthday" ADD CONSTRAINT "Birthday_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
