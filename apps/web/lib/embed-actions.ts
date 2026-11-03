'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, prisma } from '@refx/database';
import { embedSpecHasContent, embedSpecSchema, type EmbedSpec } from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { writeAuditLog } from './audit';
import { publishLiveCommand } from './redis';

/**
 * Server actions for the standalone Embed Builder page: save/delete named
 * embeds and deploy them to a channel. The bot owns the actual posting (and
 * in-place editing of an already-posted message) via the DEPLOY_EMBED live
 * command; these actions validate, persist, audit, and publish.
 */

export interface EmbedActionResult {
  ok: boolean;
  error?: string;
  /** The saved row id (create returns the new id so the UI can deploy it). */
  id?: string;
}

export interface SaveEmbedInput {
  /** Null/undefined = create a new embed. */
  id?: string | null;
  name: string;
  /** Optional plain message sent above the embed. */
  content: string;
  spec: EmbedSpec;
}

const MAX_EMBEDS_PER_GUILD = 50;

export async function saveEmbed(guildId: string, input: SaveEmbedInput): Promise<EmbedActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const name = input.name.trim();
  if (name.length === 0 || name.length > 64) {
    return { ok: false, error: 'Give the embed a name (1–64 characters).' };
  }
  const content = input.content.trim().slice(0, 2000);
  const parsed = embedSpecSchema.safeParse(input.spec);
  if (!parsed.success) {
    return { ok: false, error: 'Embed contents are invalid — check URLs and the color.' };
  }
  if (!embedSpecHasContent(parsed.data) && !content) {
    return { ok: false, error: 'Add a message or some embed content first.' };
  }

  const data = {
    name,
    content: content || null,
    spec: parsed.data as unknown as Prisma.InputJsonValue,
    updatedBy: session.user.id,
  };

  try {
    let id: string;
    if (input.id) {
      const updated = await prisma.savedEmbed.updateMany({
        where: { id: input.id, guildId },
        data,
      });
      if (updated.count === 0) return { ok: false, error: 'That embed no longer exists.' };
      id = input.id;
    } else {
      const count = await prisma.savedEmbed.count({ where: { guildId } });
      if (count >= MAX_EMBEDS_PER_GUILD) {
        return { ok: false, error: `This server already has ${MAX_EMBEDS_PER_GUILD} embeds.` };
      }
      const created = await prisma.savedEmbed.create({ data: { guildId, ...data } });
      id = created.id;
    }
    await writeAuditLog({
      guildId,
      userId: session.user.id,
      action: input.id ? 'EMBED_UPDATED' : 'EMBED_CREATED',
      after: { name },
    });
    revalidatePath(`/servers/${guildId}/embeds`);
    return { ok: true, id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, error: 'An embed with that name already exists.' };
    }
    throw err;
  }
}

/** Delete a saved embed. The posted Discord message (if any) is left in place. */
export async function deleteEmbed(guildId: string, embedId: string): Promise<EmbedActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const deleted = await prisma.savedEmbed.deleteMany({ where: { id: embedId, guildId } });
  if (deleted.count === 0) return { ok: false, error: 'That embed no longer exists.' };

  await writeAuditLog({
    guildId,
    userId: session.user.id,
    action: 'EMBED_DELETED',
    before: { embedId },
  });
  revalidatePath(`/servers/${guildId}/embeds`);
  return { ok: true };
}

/**
 * Deploy a saved embed to a channel. Re-deploying to the SAME channel edits the
 * posted message in place; picking a different channel posts fresh there (the
 * old message stays — deleting it is a moderation decision, not ours).
 */
export async function deploySavedEmbed(
  guildId: string,
  embedId: string,
  channelId: string,
): Promise<EmbedActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  if (!channelId) return { ok: false, error: 'Pick a channel to deploy to.' };

  const row = await prisma.savedEmbed.findUnique({ where: { id: embedId } });
  if (!row || row.guildId !== guildId) return { ok: false, error: 'That embed no longer exists.' };

  await prisma.savedEmbed.update({
    where: { id: row.id },
    data: {
      channelId,
      // A channel switch means a fresh post — the old messageId lives in the
      // previous channel and must not be edit-targeted.
      ...(row.channelId !== channelId ? { messageId: null } : {}),
      updatedBy: session.user.id,
    },
  });
  await publishLiveCommand(guildId, 'DEPLOY_EMBED', { embedId: row.id });
  await writeAuditLog({
    guildId,
    userId: session.user.id,
    action: 'EMBED_DEPLOYED',
    after: { name: row.name, channelId },
  });
  revalidatePath(`/servers/${guildId}/embeds`);
  return { ok: true, id: row.id };
}
