'use server';

import { revalidatePath } from 'next/cache';
import { type Prisma, prisma } from '@refx/database';
import { rolePanelInputSchema, type RolePanelInput } from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { writeAuditLog } from './audit';
import { publishLiveCommand } from './redis';

export interface PanelActionResult {
  ok: boolean;
  error?: string;
}

async function ensureGuild(guildId: string): Promise<void> {
  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
}

export async function createRolePanel(
  guildId: string,
  input: RolePanelInput,
): Promise<PanelActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const parsed = rolePanelInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid panel — add at least one role option.' };

  await ensureGuild(guildId);
  const panel = await prisma.reactionRolePanel.create({
    data: {
      guildId,
      channelId: parsed.data.channelId,
      title: parsed.data.title,
      description: parsed.data.description,
      mode: parsed.data.mode,
      type: parsed.data.type,
      options: parsed.data.options as unknown as Prisma.InputJsonValue,
    },
  });

  await writeAuditLog({
    guildId,
    userId: session.user.id,
    action: 'ROLE_PANEL_CREATED',
    module: 'ROLES',
    after: parsed.data,
  });

  if (panel.channelId) await publishLiveCommand(guildId, 'DEPLOY_PANEL', { panelId: panel.id });
  revalidatePath(`/servers/${guildId}/roles`);
  return { ok: true };
}

export async function redeployRolePanel(
  guildId: string,
  panelId: string,
): Promise<PanelActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const panel = await prisma.reactionRolePanel.findUnique({ where: { id: panelId } });
  if (!panel || panel.guildId !== guildId) return { ok: false, error: 'Panel not found.' };
  if (!panel.channelId) return { ok: false, error: 'Set a channel for this panel first.' };

  await publishLiveCommand(guildId, 'DEPLOY_PANEL', { panelId });
  revalidatePath(`/servers/${guildId}/roles`);
  return { ok: true };
}

export async function deleteRolePanel(
  guildId: string,
  panelId: string,
): Promise<PanelActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const panel = await prisma.reactionRolePanel.findUnique({ where: { id: panelId } });
  if (!panel || panel.guildId !== guildId) return { ok: false, error: 'Panel not found.' };

  if (panel.channelId && panel.messageId) {
    await publishLiveCommand(guildId, 'DELETE_PANEL', {
      channelId: panel.channelId,
      messageId: panel.messageId,
    });
  }
  await prisma.reactionRolePanel.delete({ where: { id: panelId } });
  await writeAuditLog({
    guildId,
    userId: session.user.id,
    action: 'ROLE_PANEL_DELETED',
    module: 'ROLES',
    before: { title: panel.title },
  });
  revalidatePath(`/servers/${guildId}/roles`);
  return { ok: true };
}
