import { Prisma, prisma, type CaseType, type ModerationCase } from '@refx/database';

/**
 * Idempotent, race-tolerant guild ensure. Under concurrent first-touch of a new
 * guild, Prisma's `upsert` (with an empty update) can fall back to a
 * select-then-insert and lose the PK race; we swallow the resulting P2002 since
 * it means a concurrent call already created the row.
 */
async function ensureGuild(guildId: string): Promise<void> {
  try {
    await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }
}

export interface CreateCaseInput {
  guildId: string;
  type: CaseType;
  targetId: string;
  moderatorId: string;
  reason?: string | null;
  durationSeconds?: number | null;
  expiresAt?: Date | null;
}

/**
 * Create a numbered moderation case (§6). The per-guild case number is
 * allocated by atomically incrementing `Guild.caseCounter` inside a
 * transaction — the row-level lock serializes concurrent allocations, so two
 * simultaneous actions never collide (the `@@unique([guildId, caseNumber])`
 * constraint is the backstop).
 */
export async function createModerationCase(input: CreateCaseInput): Promise<ModerationCase> {
  // Ensure the guild row exists before the atomic counter bump (handled outside
  // the transaction so the create-race is resolved independently).
  await ensureGuild(input.guildId);
  return prisma.$transaction(async (tx) => {
    // Atomic per-guild allocation: the row-level lock on this UPDATE serializes
    // concurrent allocations, so each call gets a distinct caseNumber.
    const { caseCounter } = await tx.guild.update({
      where: { id: input.guildId },
      data: { caseCounter: { increment: 1 } },
      select: { caseCounter: true },
    });
    return tx.moderationCase.create({
      data: {
        guildId: input.guildId,
        caseNumber: caseCounter,
        type: input.type,
        targetId: input.targetId,
        moderatorId: input.moderatorId,
        reason: input.reason ?? null,
        duration: input.durationSeconds ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });
  });
}

/** Mark a guild member's active temp-ban cases as resolved (e.g. after unban). */
export function deactivateTempBans(guildId: string, targetId: string): Promise<{ count: number }> {
  return prisma.moderationCase.updateMany({
    where: { guildId, targetId, type: 'TEMPBAN', active: true },
    data: { active: false },
  });
}
