'use server';

import { revalidatePath } from 'next/cache';
import { type Prisma, prisma } from '@refx/database';
import { rolePanelInputSchema, rolePanelProblems, type RolePanelInput } from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { writeAuditLog } from './audit';
import { publishLiveCommand, runLiveCommand } from './redis';

export interface PanelActionResult {
  ok: boolean;
  /** Why it failed, shown to the admin as-is. */
  error?: string;
  /** It worked, with something worth knowing (e.g. a role the bot can't assign). */
  notice?: string;
}

const NO_ANSWER =
  'The bot didn’t confirm the post within 10 seconds, so it may be offline or busy. ' +
  'The panel is saved and listed as "not deployed"; press its Deploy button to try again.';

async function ensureGuild(guildId: string): Promise<void> {
  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
}

/**
 * Create a panel and post it. The row is only kept when the post worked (or
 * the bot didn't answer): if Discord refuses it, the row is removed again and
 * the reason returned, so the admin fixes the form they still have open rather
 * than being left with a half-made panel.
 */
export async function createRolePanel(
  guildId: string,
  input: RolePanelInput,
): Promise<PanelActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const parsed = rolePanelInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: rolePanelProblems(input).join(' ') };

  try {
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

    let notice: string | undefined;
    if (!panel.channelId) {
      notice = 'Saved without a channel, so it isn’t posted anywhere yet.';
    } else {
      const result = await runLiveCommand(guildId, 'DEPLOY_PANEL', { panelId: panel.id });
      if (result && !result.ok) {
        await prisma.reactionRolePanel.delete({ where: { id: panel.id } }).catch(() => undefined);
        return { ok: false, error: result.error ?? 'The bot could not post the panel.' };
      }
      notice = result ? result.warnings?.join(' ') : NO_ANSWER;
    }

    await writeAuditLog({
      guildId,
      userId: session.user.id,
      action: 'ROLE_PANEL_CREATED',
      module: 'ROLES',
      after: parsed.data,
    });
    revalidatePath(`/servers/${guildId}/roles`);
    return { ok: true, notice };
  } catch (err) {
    console.error('createRolePanel failed', err);
    return {
      ok: false,
      error: 'The dashboard couldn’t save the panel (database or connection problem). Try again.',
    };
  }
}

/**
 * Edit a panel that already exists. The posted message is edited in place (or
 * posted fresh when the channel changed, with the old one removed). If Discord
 * refuses the new version, the saved panel is put back exactly as it was, so
 * what is stored always matches what members see.
 */
export async function updateRolePanel(
  guildId: string,
  panelId: string,
  input: RolePanelInput,
): Promise<PanelActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const parsed = rolePanelInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: rolePanelProblems(input).join(' ') };

  try {
    const before = await prisma.reactionRolePanel.findUnique({ where: { id: panelId } });
    if (!before || before.guildId !== guildId) {
      return { ok: false, error: 'That panel no longer exists. It may have been deleted.' };
    }
    const moved = before.channelId !== parsed.data.channelId;

    await prisma.reactionRolePanel.update({
      where: { id: panelId },
      data: {
        channelId: parsed.data.channelId,
        title: parsed.data.title,
        description: parsed.data.description,
        mode: parsed.data.mode,
        type: parsed.data.type,
        options: parsed.data.options as unknown as Prisma.InputJsonValue,
        // A different channel needs a fresh message there.
        messageId: moved ? null : before.messageId,
      },
    });

    let notice: string | undefined;
    if (!parsed.data.channelId) {
      notice = 'Saved without a channel, so it isn’t posted anywhere now.';
    } else {
      const result = await runLiveCommand(guildId, 'DEPLOY_PANEL', { panelId });
      if (result && !result.ok) {
        await prisma.reactionRolePanel
          .update({
            where: { id: panelId },
            data: {
              channelId: before.channelId,
              title: before.title,
              description: before.description,
              mode: before.mode,
              type: before.type,
              options: before.options as Prisma.InputJsonValue,
              messageId: before.messageId,
            },
          })
          .catch(() => undefined);
        return {
          ok: false,
          error: `${result.error ?? 'The bot could not update the panel.'} The posted panel was left as it was.`,
        };
      }
      notice = result ? result.warnings?.join(' ') : NO_ANSWER;
    }

    // Moved (or un-channelled): take the old message down.
    if (moved && before.channelId && before.messageId) {
      await publishLiveCommand(guildId, 'DELETE_PANEL', {
        channelId: before.channelId,
        messageId: before.messageId,
      });
    }

    await writeAuditLog({
      guildId,
      userId: session.user.id,
      action: 'ROLE_PANEL_UPDATED',
      module: 'ROLES',
      before: { title: before.title, channelId: before.channelId, options: before.options },
      after: parsed.data,
    });
    revalidatePath(`/servers/${guildId}/roles`);
    return { ok: true, notice };
  } catch (err) {
    console.error('updateRolePanel failed', err);
    return {
      ok: false,
      error: 'The dashboard couldn’t save the changes (database or connection problem). Try again.',
    };
  }
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

  const result = await runLiveCommand(guildId, 'DEPLOY_PANEL', { panelId });
  revalidatePath(`/servers/${guildId}/roles`);
  if (!result) {
    return {
      ok: false,
      error: 'The bot didn’t confirm within 10 seconds. It may be offline or busy; try again.',
    };
  }
  if (!result.ok) return { ok: false, error: result.error ?? 'The bot could not post the panel.' };
  return { ok: true, notice: result.warnings?.join(' ') };
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
