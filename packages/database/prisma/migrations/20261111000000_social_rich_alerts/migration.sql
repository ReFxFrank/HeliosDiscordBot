-- Richer social alerts: custom message text, and for Twitch the live alert
-- message (edited while live, marked ended after) plus an optional live role.
ALTER TABLE "SocialSubscription"
  ADD COLUMN "message" TEXT,
  ADD COLUMN "liveMessageId" TEXT,
  ADD COLUMN "liveRoleId" TEXT,
  ADD COLUMN "liveUserId" TEXT;
