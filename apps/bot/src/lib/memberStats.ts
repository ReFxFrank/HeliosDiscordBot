import { prisma } from '@refx/database';

/**
 * Counter fields on MemberStat that increment over time. (Invites are derived
 * from the InviteUse table instead of a counter, so they're not listed here.)
 */
export type MemberStatField =
  'reactionsAdded' | 'threadsCreated' | 'threadsJoined' | 'giveawaysJoined' | 'itemsPurchased';

/** Boolean (0/1) fields on MemberStat. */
export type MemberFlagField = 'boosted' | 'birthdaySet';

/** Atomically increment a member's activity counter (lazily creating the row). */
export async function bumpMemberStat(
  guildId: string,
  userId: string,
  field: MemberStatField,
  by = 1,
): Promise<void> {
  await prisma.memberStat.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { [field]: { increment: by } },
    create: { guildId, userId, [field]: by },
  });
}

/** Set a member's boolean flag to 1 (idempotent). */
export async function setMemberFlag(
  guildId: string,
  userId: string,
  field: MemberFlagField,
): Promise<void> {
  await prisma.memberStat.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { [field]: 1 },
    create: { guildId, userId, [field]: 1 },
  });
}
