import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@refx/database';
import { createModerationCase } from './cases';

const RUN = process.env.VITEST_SKIP_INTEGRATION !== '1';
const suite = RUN ? describe : describe.skip;

const GUILD_ID = `test-guild-cases-${Date.now()}`;

suite('createModerationCase (integration)', () => {
  beforeAll(async () => {
    await prisma.guild.deleteMany({ where: { id: GUILD_ID } });
  });
  afterAll(async () => {
    await prisma.guild.deleteMany({ where: { id: GUILD_ID } });
    await prisma.$disconnect();
  });

  it('allocates sequential per-guild case numbers', async () => {
    const first = await createModerationCase({
      guildId: GUILD_ID,
      type: 'WARN',
      targetId: 'u1',
      moderatorId: 'm1',
      reason: 'one',
    });
    const second = await createModerationCase({
      guildId: GUILD_ID,
      type: 'BAN',
      targetId: 'u2',
      moderatorId: 'm1',
    });
    expect(first.caseNumber).toBe(1);
    expect(second.caseNumber).toBe(2);
  });

  it('never collides under concurrent allocation', async () => {
    const concurrentGuild = `${GUILD_ID}-concurrent`;
    await prisma.guild.deleteMany({ where: { id: concurrentGuild } });
    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          createModerationCase({
            guildId: concurrentGuild,
            type: 'NOTE',
            targetId: `u${i}`,
            moderatorId: 'm1',
          }),
        ),
      );
      const numbers = results.map((c) => c.caseNumber).sort((a, b) => a - b);
      expect(new Set(numbers).size).toBe(12); // all distinct
      expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => i + 1)); // 1..12
    } finally {
      await prisma.guild.deleteMany({ where: { id: concurrentGuild } });
    }
  });
});
