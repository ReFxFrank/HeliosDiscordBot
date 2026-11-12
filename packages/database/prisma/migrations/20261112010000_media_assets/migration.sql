-- Images uploaded from the dashboard, served at /media/<id>.<ext>.
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MediaAsset_guildId_createdAt_idx" ON "MediaAsset"("guildId", "createdAt");

ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
