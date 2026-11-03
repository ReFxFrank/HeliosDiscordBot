-- ReFx rework: the bot is single-community now. Drop the SaaS-only tables
-- (premium billing, bot-list votes, economy, per-guild custom bots, the public
-- status-page incidents) and the premium tier flag.
--
-- Postgres cannot drop enum values, so "Module".ECONOMY / MUSIC stay as dead
-- values; clean up every row that referenced them (audit history is retained).
DELETE FROM "GuildModuleConfig" WHERE "module" IN ('ECONOMY', 'MUSIC');
DELETE FROM "GlobalModuleFlag" WHERE "module" IN ('ECONOMY', 'MUSIC');

DROP TABLE IF EXISTS "GuildSubscription";
DROP TABLE IF EXISTS "TopggVote";
DROP TABLE IF EXISTS "EconomyUser";
DROP TABLE IF EXISTS "CustomBot";
DROP TABLE IF EXISTS "IncidentUpdate";
DROP TABLE IF EXISTS "Incident";

ALTER TABLE "Guild" DROP COLUMN IF EXISTS "premiumTier";

DROP TYPE IF EXISTS "PremiumTier";
DROP TYPE IF EXISTS "IncidentStatus";
DROP TYPE IF EXISTS "IncidentSeverity";
