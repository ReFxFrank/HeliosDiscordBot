-- Tickets: ticket types, opening answers, claiming, close reasons, and a
-- "closed but still there" state (closing now locks the channel; staff delete it).
ALTER TABLE "Ticket"
  ADD COLUMN "typeId" TEXT,
  ADD COLUMN "typeLabel" TEXT,
  ADD COLUMN "claimedById" TEXT,
  ADD COLUMN "answers" JSONB,
  ADD COLUMN "controlMessageId" TEXT,
  ADD COLUMN "closeReason" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Until now closing a ticket deleted its channel, so every closed ticket is gone.
UPDATE "Ticket" SET "deletedAt" = COALESCE("closedAt", CURRENT_TIMESTAMP) WHERE "status" = 'CLOSED';
