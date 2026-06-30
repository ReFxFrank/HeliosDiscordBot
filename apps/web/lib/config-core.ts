import { type Prisma, prisma } from '@helios/database';
import { moderationConfigSchema, type Module, type ModerationConfig } from '@helios/shared';
import { writeAuditLog } from './audit';
import { publishConfigUpdate } from './redis';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface GuildSettingsInput {
  locale: string;
  timezone: string;
  prefix: string;
}

/** Ensure the guild row exists before writing a config row (FK requirement). */
async function ensureGuild(guildId: string): Promise<void> {
  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
}

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

/**
 * Core of a module toggle: write Postgres, record an audit entry, and publish
 * the invalidation that makes the live bot reflect it in ~1s (§4.1, §11). No
 * auth or revalidation here so it stays unit-testable.
 */
export async function applyModuleEnabled(
  guildId: string,
  module: Module,
  enabled: boolean,
  userId: string,
): Promise<void> {
  await ensureGuild(guildId);
  const before = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module } },
    select: { enabled: true },
  });
  await prisma.guildModuleConfig.upsert({
    where: { guildId_module: { guildId, module } },
    update: { enabled, updatedBy: userId },
    create: { guildId, module, enabled, updatedBy: userId },
  });
  await writeAuditLog({
    guildId,
    userId,
    action: enabled ? 'MODULE_ENABLED' : 'MODULE_DISABLED',
    module,
    before: { enabled: before?.enabled ?? false },
    after: { enabled },
  });
  await publishConfigUpdate(guildId, module);
}

export async function applyModerationConfig(
  guildId: string,
  input: ModerationConfig,
  userId: string,
): Promise<ActionResult> {
  const parsed = moderationConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid configuration.' };

  await ensureGuild(guildId);
  const before = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'MODERATION' } },
    select: { config: true },
  });
  await prisma.guildModuleConfig.upsert({
    where: { guildId_module: { guildId, module: 'MODERATION' } },
    update: { config: asJson(parsed.data), updatedBy: userId },
    create: {
      guildId,
      module: 'MODERATION',
      enabled: true,
      config: asJson(parsed.data),
      updatedBy: userId,
    },
  });
  await writeAuditLog({
    guildId,
    userId,
    action: 'MODERATION_CONFIG_UPDATED',
    module: 'MODERATION',
    before: before?.config ?? null,
    after: parsed.data,
  });
  await publishConfigUpdate(guildId, 'MODERATION');
  return { ok: true };
}

export async function applyGuildSettings(
  guildId: string,
  input: GuildSettingsInput,
  userId: string,
): Promise<ActionResult> {
  const prefix = input.prefix.trim().slice(0, 5) || '!';
  const locale = input.locale.trim().slice(0, 10) || 'en-US';
  const timezone = input.timezone.trim().slice(0, 64) || 'UTC';

  await ensureGuild(guildId);
  const before = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { locale: true, timezone: true, prefix: true },
  });
  await prisma.guild.update({ where: { id: guildId }, data: { locale, timezone, prefix } });
  await writeAuditLog({
    guildId,
    userId,
    action: 'GUILD_SETTINGS_UPDATED',
    before: before ?? null,
    after: { locale, timezone, prefix },
  });
  return { ok: true };
}
