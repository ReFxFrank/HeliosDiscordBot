'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@refx/database';
import { assertCanManage, requireSession } from './auth-guards';
import { writeAuditLog } from './audit';
import { publishLiveCommand } from './redis';

export interface CommandToggleResult {
  ok: boolean;
  error?: string;
}

// Discord command names: 1–32 chars, lowercase word chars and dashes.
const COMMAND_NAME = /^[\w-]{1,32}$/;

/**
 * Turn a single slash command on/off for a guild. Writes the
 * Guild.disabledCommands array, audits it, and publishes the live invalidation
 * so the bot's dispatch gate reflects it in ~1s.
 */
export async function setCommandEnabled(
  guildId: string,
  command: string,
  enabled: boolean,
): Promise<CommandToggleResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const name = command.trim().toLowerCase();
  if (!COMMAND_NAME.test(name)) return { ok: false, error: 'Invalid command name.' };

  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
  const row = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { disabledCommands: true },
  });
  const before = new Set(row?.disabledCommands ?? []);
  const after = new Set(before);
  if (enabled) after.delete(name);
  else after.add(name);
  if (after.size === before.size && [...after].every((c) => before.has(c))) return { ok: true };

  await prisma.guild.update({
    where: { id: guildId },
    data: { disabledCommands: [...after].sort() },
  });
  await writeAuditLog({
    guildId,
    userId: session.user.id,
    action: enabled ? 'COMMAND_ENABLED' : 'COMMAND_DISABLED',
    before: { command: name, disabled: before.has(name) },
    after: { command: name, disabled: !enabled },
  });
  await publishLiveCommand(guildId, 'REFRESH_COMMAND_TOGGLES').catch(() => undefined);
  revalidatePath(`/servers/${guildId}/slash-commands`);
  return { ok: true };
}
