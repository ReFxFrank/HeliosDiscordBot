'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@refx/database';
import { requireOwner } from './auth-guards';

export interface AdminActionResult {
  ok: boolean;
  error?: string;
}

/** Add or update a blacklist entry for a guild or user. Owner-only. */
export async function addBlacklist(
  type: 'GUILD' | 'USER',
  targetId: string,
  reason: string | null,
): Promise<AdminActionResult> {
  await requireOwner();
  try {
    await prisma.blacklist.upsert({
      where: { type_targetId: { type, targetId } },
      update: { reason },
      create: { type, targetId, reason },
    });
    revalidatePath('/admin');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not add to blacklist.' };
  }
}

/** Globally enable/disable a module across every guild + dashboard. Owner-only. */
export async function setGlobalModule(
  module: string,
  enabled: boolean,
): Promise<AdminActionResult> {
  await requireOwner();
  try {
    await prisma.globalModuleFlag.upsert({
      where: { module },
      update: { enabled },
      create: { module, enabled },
    });
    revalidatePath('/admin');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not update feature flag.' };
  }
}

/** Remove a blacklist entry for a guild or user. Owner-only. */
export async function removeBlacklist(
  type: 'GUILD' | 'USER',
  targetId: string,
): Promise<AdminActionResult> {
  await requireOwner();
  try {
    await prisma.blacklist.deleteMany({ where: { type, targetId } });
    revalidatePath('/admin');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not remove from blacklist.' };
  }
}
