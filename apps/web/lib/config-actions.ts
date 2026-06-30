'use server';

import { revalidatePath } from 'next/cache';
import type {
  AutoroleConfig,
  BirthdaysConfig,
  CustomCommandsConfig,
  InviteTrackingConfig,
  LevelingConfig,
  LoggingConfig,
  Module,
  ModerationConfig,
  ModuleWithSchema,
  RefxAlertsConfig,
  StarboardConfig,
  StatsCountersConfig,
  SuggestionsConfig,
  TicketsConfig,
  WelcomeConfig,
} from '@helios/shared';
import { assertCanManage, requireSession } from './auth-guards';
import {
  applyGuildSettings,
  applyModuleConfig,
  applyModuleEnabled,
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
  await applyModuleEnabled(guildId, module, enabled, session.user.id);
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

export async function saveRefxAlertsConfig(
  guildId: string,
  input: RefxAlertsConfig,
): Promise<ActionResult> {
  return saveConfig(guildId, 'REFX_ALERTS', input, 'refx-alerts');
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

export async function saveStatsCountersConfig(
  guildId: string,
  input: StatsCountersConfig,
): Promise<ActionResult> {
  const result = await saveConfig(guildId, 'STATS_COUNTERS', input, 'stats');
  // Nudge the bot to refresh channel names immediately (and re-arm the loop).
  if (result.ok) await publishLiveCommand(guildId, 'REFRESH_STATS').catch(() => undefined);
  return result;
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
