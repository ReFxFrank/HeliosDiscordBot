'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, prisma } from '@refx/database';
import { customCommandInputSchema, type CustomCommandInput } from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { writeAuditLog } from './audit';

export interface CommandActionResult {
  ok: boolean;
  error?: string;
}

async function ensureGuild(guildId: string): Promise<void> {
  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
}

/** Create or replace a tag (keyed on its lowercased name). */
export async function upsertCustomCommand(
  guildId: string,
  input: CustomCommandInput,
): Promise<CommandActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const normalized = { ...input, name: input.name.trim().toLowerCase() };
  const parsed = customCommandInputSchema.safeParse(normalized);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid tag.' };
  }

  await ensureGuild(guildId);
  const embed = parsed.data.embed ? (parsed.data.embed as Prisma.InputJsonValue) : Prisma.DbNull;
  await prisma.customCommand.upsert({
    where: { guildId_name: { guildId, name: parsed.data.name } },
    update: { content: parsed.data.content ?? null, embed },
    create: {
      guildId,
      name: parsed.data.name,
      content: parsed.data.content ?? null,
      embed,
      createdBy: session.user.id,
    },
  });

  await writeAuditLog({
    guildId,
    userId: session.user.id,
    action: 'CUSTOM_COMMAND_SAVED',
    module: 'CUSTOM_COMMANDS',
    after: { name: parsed.data.name },
  });
  revalidatePath(`/servers/${guildId}/commands`);
  return { ok: true };
}

export async function deleteCustomCommand(
  guildId: string,
  name: string,
): Promise<CommandActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  await prisma.customCommand.deleteMany({ where: { guildId, name: name.toLowerCase() } });
  await writeAuditLog({
    guildId,
    userId: session.user.id,
    action: 'CUSTOM_COMMAND_DELETED',
    module: 'CUSTOM_COMMANDS',
    before: { name },
  });
  revalidatePath(`/servers/${guildId}/commands`);
  return { ok: true };
}
