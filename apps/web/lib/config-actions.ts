'use server';

import { revalidatePath } from 'next/cache';
import type {
  AchievementsConfig,
  AutomodConfig,
  AutoroleConfig,
  BirthdaysConfig,
  CustomCommandsConfig,
  FivemConfig,
  InviteTrackingConfig,
  LevelingConfig,
  LoggingConfig,
  Module,
  ModerationConfig,
  ModuleWithSchema,
  PollsConfig,
  StarboardConfig,
  StatsCountersConfig,
  SuggestionsConfig,
  TempVoiceConfig,
  TicketsConfig,
  VerificationConfig,
  WelcomeConfig,
} from '@refx/shared';
import { prisma } from '@refx/database';
import { assertCanManage, requireSession } from './auth-guards';
import { MODULE_META } from './modules';
import {
  applyGuildSettings,
  applyModuleConfig,
  applyModuleEnabled,
  triggerTicketsAutoSetupIfNeeded,
  type ActionResult,
  type GuildSettingsInput,
} from './config-core';
import { publishLiveCommand } from './redis';

export type { ActionResult, GuildSettingsInput } from './config-core';

/**
 * Toggle a module on/off. Re-verifies Manage-Server server-side (§9/§10), then
 * writes Postgres + audit + publishes the cache invalidation so the live bot
 * reflects it in ~1s.
 */
export async function setModuleEnabled(
  guildId: string,
  module: Module,
  enabled: boolean,
): Promise<void> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  // Server-side check (the UI hides globally-disabled modules but the action is
  // a directly-invokable POST). Only gate ENABLING — disabling is always allowed.
  if (enabled) await assertNotGloballyDisabled(module);
  await applyModuleEnabled(guildId, module, enabled, session.user.id);
  await triggerTicketsAutoSetupIfNeeded(guildId, module, enabled);
  revalidatePath(`/servers/${guildId}`);
}

/**
 * Reject enabling a module the bot owner has globally disabled. The bot's
 * runtime already refuses to RUN such modules; this closes the gap where the
 * enabled flag could still be flipped by calling the server action directly.
 */
async function assertNotGloballyDisabled(module: Module): Promise<void> {
  const globalFlag = await prisma.globalModuleFlag.findUnique({
    where: { module },
    select: { enabled: true },
  });
  if (globalFlag && !globalFlag.enabled) {
    throw new Error('This module is currently disabled by the bot operator.');
  }
}

/**
 * Bulk enable/disable every module in the grid. Idempotent by construction:
 * modules already in the requested state are skipped entirely (no writes, no
 * audit spam, no invalidations). Owner-globally-disabled modules are never
 * touched in either direction.
 */
export async function setAllModulesEnabled(guildId: string, enabled: boolean): Promise<void> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const [flags, existing] = await Promise.all([
    prisma.globalModuleFlag.findMany({ where: { enabled: false }, select: { module: true } }),
    prisma.guildModuleConfig.findMany({
      where: { guildId },
      select: { module: true, enabled: true },
    }),
  ]);
  const globallyOff = new Set(flags.map((flag) => flag.module));
  const current = new Map(existing.map((row) => [row.module as Module, row.enabled]));

  const targets = MODULE_META.filter(
    (meta) =>
      !globallyOff.has(meta.module) &&
      (current.get(meta.module) ?? false) !== enabled,
  );

  // Sequential on purpose: each apply audits + publishes its own invalidation,
  // and the worst case (~30 modules) is well under a second.
  for (const meta of targets) {
    await applyModuleEnabled(guildId, meta.module, enabled, session.user.id);
    await triggerTicketsAutoSetupIfNeeded(guildId, meta.module, enabled);
  }
  revalidatePath(`/servers/${guildId}`);
}

async function saveConfig(
  guildId: string,
  module: ModuleWithSchema,
  input: unknown,
  slug: string,
): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  const result = await applyModuleConfig(guildId, module, input, session.user.id);
  if (result.ok) revalidatePath(`/servers/${guildId}/${slug}`);
  return result;
}

export async function saveModerationConfig(
  guildId: string,
  input: ModerationConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'MODERATION', input, 'moderation');
}

export async function saveAutomodConfig(
  guildId: string,
  input: AutomodConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'AUTOMOD', input, 'automod');
}

export async function saveWelcomeConfig(
  guildId: string,
  input: WelcomeConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'WELCOME', input, 'welcome');
}

export async function saveAutoroleConfig(
  guildId: string,
  input: AutoroleConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'AUTOROLE', input, 'autoroles');
}

export async function saveLevelingConfig(
  guildId: string,
  input: LevelingConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'LEVELING', input, 'leveling');
}

export async function saveLoggingConfig(
  guildId: string,
  input: LoggingConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'LOGGING', input, 'logging');
}

export async function saveStarboardConfig(
  guildId: string,
  input: StarboardConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'STARBOARD', input, 'starboard');
}

export async function saveTicketsConfig(
  guildId: string,
  input: TicketsConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'TICKETS', input, 'tickets');
}


export async function saveCustomCommandsConfig(
  guildId: string,
  input: CustomCommandsConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'CUSTOM_COMMANDS', input, 'commands');
}

export async function saveSuggestionsConfig(
  guildId: string,
  input: SuggestionsConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'SUGGESTIONS', input, 'suggestions');
}

export async function saveBirthdaysConfig(
  guildId: string,
  input: BirthdaysConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'BIRTHDAYS', input, 'birthdays');
}

export async function saveInviteTrackingConfig(
  guildId: string,
  input: InviteTrackingConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'INVITE_TRACKING', input, 'invites');
}

export async function saveTempVoiceConfig(
  guildId: string,
  input: TempVoiceConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'TEMP_VOICE', input, 'temp-voice');
}

export async function saveStatsCountersConfig(
  guildId: string,
  input: StatsCountersConfig,
): Promise<ActionResult> {
  const result = await saveConfig(guildId, 'STATS_COUNTERS', input, 'stats');
  // Nudge the bot to refresh channel names immediately (and re-arm the loop).
  if (result.ok) await publishLiveCommand(guildId, 'REFRESH_STATS').catch(() => undefined);
  return result;
}

export async function saveAchievementsConfig(
  guildId: string,
  input: AchievementsConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'ACHIEVEMENTS', input, 'achievements');
}

export async function savePollsConfig(guildId: string, input: PollsConfig): Promise<ActionResult> {
  return saveConfig(guildId, 'POLLS', input, 'polls');
}

export async function saveVerificationConfig(
  guildId: string,
  input: VerificationConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'VERIFICATION', input, 'verification');
}

export async function saveGuildSettings(
  guildId: string,
  input: GuildSettingsInput,
): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  const result = await applyGuildSettings(guildId, input, session.user.id);
  if (result.ok) revalidatePath(`/servers/${guildId}/settings`);
  return result;
}

export async function saveFivemConfig(guildId: string, input: FivemConfig): Promise<ActionResult> {
  const result = await saveConfig(guildId, 'FIVEM', input, 'fivem');
  // Re-render the status panel with the new settings (title, image, connect info).
  if (result.ok) {
    await publishLiveCommand(guildId, 'FIVEM_REFRESH', { repost: false }).catch(() => undefined);
  }
  return result;
}
