'use server';

import { revalidatePath } from 'next/cache';
import type { Module, ModerationConfig } from '@helios/shared';
import { assertCanManage, requireSession } from './auth-guards';
import {
  applyGuildSettings,
  applyModerationConfig,
  applyModuleEnabled,
  type ActionResult,
  type GuildSettingsInput,
} from './config-core';

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

export async function saveModerationConfig(
  guildId: string,
  input: ModerationConfig,
): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  const result = await applyModerationConfig(guildId, input, session.user.id);
  if (result.ok) revalidatePath(`/servers/${guildId}/moderation`);
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
