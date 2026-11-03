import { type Prisma, prisma } from '@refx/database';
import { parseModuleConfig, type Module, type ModuleWithSchema } from '@refx/shared';
import { writeAuditLog } from './audit';
import { publishConfigUpdate, publishLiveCommand } from './redis';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface GuildSettingsInput {
  locale: string;
  timezone: string;
  prefix: string;
  /** Voice channel the bot parks itself in 24/7; null/undefined disables. */
  stayVoiceChannelId?: string | null;
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

/**
 * First-enable convenience: switching Tickets on with nothing configured asks
 * the bot to bootstrap itself (category, channels, support roles, panel). A
 * configured module is left exactly as-is. No-op for other modules / disables.
 * Shared by the single toggle, the bulk toggle, and the setup wizard.
 */
export async function triggerTicketsAutoSetupIfNeeded(
  guildId: string,
  module: Module,
  enabled: boolean,
): Promise<void> {
  if (module !== 'TICKETS' || !enabled) return;
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'TICKETS' } },
    select: { config: true },
  });
  const categoryId = (row?.config as { categoryId?: string | null } | null)?.categoryId ?? null;
  if (!categoryId) await publishLiveCommand(guildId, 'SETUP_TICKETS');
}

/**
 * Validate (via the module's shared zod schema) and persist a module's config
 * blob, audit it, and publish the live invalidation. Enabled state is preserved
 * — the grid toggle owns it.
 */
export async function applyModuleConfig<M extends ModuleWithSchema>(
  guildId: string,
  module: M,
  input: unknown,
  userId: string,
): Promise<ActionResult> {
  let parsed: unknown;
  try {
    parsed = parseModuleConfig(module, input);
  } catch {
    return { ok: false, error: 'Invalid configuration.' };
  }

  await ensureGuild(guildId);
  const before = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module } },
    select: { config: true },
  });
  await prisma.guildModuleConfig.upsert({
    where: { guildId_module: { guildId, module } },
    update: { config: asJson(parsed), updatedBy: userId },
    create: { guildId, module, config: asJson(parsed), updatedBy: userId },
  });
  await writeAuditLog({
    guildId,
    userId,
    action: `${module}_CONFIG_UPDATED`,
    module,
    before: before?.config ?? null,
    after: asJson(parsed),
  });
  await publishConfigUpdate(guildId, module);
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
  const stayVoiceChannelId = input.stayVoiceChannelId?.trim().slice(0, 25) || null;

  await ensureGuild(guildId);
  const before = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { locale: true, timezone: true, prefix: true, stayVoiceChannelId: true },
  });
  await prisma.guild.update({
    where: { id: guildId },
    data: { locale, timezone, prefix, stayVoiceChannelId },
  });
  await writeAuditLog({
    guildId,
    userId,
    action: 'GUILD_SETTINGS_UPDATED',
    before: before ?? null,
    after: { locale, timezone, prefix, stayVoiceChannelId },
  });
  // The bot owns joining/leaving; nudge it to reconcile its voice presence.
  if ((before?.stayVoiceChannelId ?? null) !== stayVoiceChannelId) {
    await publishLiveCommand(guildId, 'SYNC_STAY_VOICE').catch(() => undefined);
  }
  return { ok: true };
}
