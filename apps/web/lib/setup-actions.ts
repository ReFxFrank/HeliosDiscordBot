'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@refx/database';
import { assertCanManage, requireSession } from './auth-guards';
import { applyModuleEnabled, triggerTicketsAutoSetupIfNeeded } from './config-core';
import { setupPreset } from './setup-presets';

/**
 * Apply a quick-setup preset (first-run wizard): enable the preset's modules
 * with the bot's defaults, then mark setup complete so the wizard stops
 * showing. Idempotent — modules already on are skipped. Owner-globally-disabled
 * modules are never touched. Re-verifies Manage-Server server-side.
 */
export async function applySetupPreset(guildId: string, presetKey: string): Promise<void> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const preset = setupPreset(presetKey);
  if (!preset) throw new Error('Unknown setup preset.');

  const [flags, existing] = await Promise.all([
    prisma.globalModuleFlag.findMany({ where: { enabled: false }, select: { module: true } }),
    prisma.guildModuleConfig.findMany({
      where: { guildId },
      select: { module: true, enabled: true },
    }),
  ]);
  const globallyOff = new Set(flags.map((flag) => flag.module));
  const alreadyOn = new Set(existing.filter((row) => row.enabled).map((row) => row.module));

  for (const module of preset.modules) {
    if (globallyOff.has(module)) continue; // operator-disabled — leave off
    if (alreadyOn.has(module)) continue; // already enabled — no-op
    await applyModuleEnabled(guildId, module, true, session.user.id);
    await triggerTicketsAutoSetupIfNeeded(guildId, module, true);
  }

  await prisma.guild.update({ where: { id: guildId }, data: { setupCompletedAt: new Date() } });
  revalidatePath(`/servers/${guildId}`);
}

/** Dismiss the quick-setup wizard without applying a preset. */
export async function dismissSetup(guildId: string): Promise<void> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  await prisma.guild.update({ where: { id: guildId }, data: { setupCompletedAt: new Date() } });
  revalidatePath(`/servers/${guildId}`);
}
