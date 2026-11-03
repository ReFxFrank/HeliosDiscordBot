'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@refx/database';
import { assertCanManage, requireSession } from './auth-guards';
import { publishLiveCommand } from './redis';

export interface GiveawayActionResult {
  ok: boolean;
  error?: string;
}

async function authorize(guildId: string, giveawayId: string): Promise<GiveawayActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  const giveaway = await prisma.giveaway.findUnique({ where: { id: giveawayId } });
  if (!giveaway || giveaway.guildId !== guildId) return { ok: false, error: 'Giveaway not found.' };
  return { ok: true };
}

export async function endGiveawayAction(
  guildId: string,
  giveawayId: string,
): Promise<GiveawayActionResult> {
  const auth = await authorize(guildId, giveawayId);
  if (!auth.ok) return auth;
  await publishLiveCommand(guildId, 'END_GIVEAWAY', { giveawayId });
  revalidatePath(`/servers/${guildId}/giveaways`);
  return { ok: true };
}

export async function rerollGiveawayAction(
  guildId: string,
  giveawayId: string,
): Promise<GiveawayActionResult> {
  const auth = await authorize(guildId, giveawayId);
  if (!auth.ok) return auth;
  await publishLiveCommand(guildId, 'REROLL_GIVEAWAY', { giveawayId });
  revalidatePath(`/servers/${guildId}/giveaways`);
  return { ok: true };
}
