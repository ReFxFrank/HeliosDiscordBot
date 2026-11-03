import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@refx/database';
import { awardXp } from './leveling';

const RUN = process.env.VITEST_SKIP_INTEGRATION !== '1';
const suite = RUN ? describe : describe.skip;

const GUILD = `test-guild-xp-${Date.now()}`;

suite('awardXp (integration)', () => {
  beforeAll(async () => {
    await prisma.guild.deleteMany({ where: { id: GUILD } });
    await prisma.guild.create({ data: { id: GUILD } });
  });
  afterAll(async () => {
    await prisma.guild.deleteMany({ where: { id: GUILD } });
    await prisma.$disconnect();
  });

  it('awards XP, enforces the cooldown, and reports level-ups', async () => {
    const t0 = 1_000_000;

    const first = await awardXp({
      guildId: GUILD,
      userId: 'u',
      min: 150,
      max: 150,
      cooldownSeconds: 60,
      now: t0,
    });
    expect(first).toMatchObject({ awarded: true, xp: 150, level: 1, leveledUp: true });

    // Within the cooldown window — not awarded.
    const blocked = await awardXp({
      guildId: GUILD,
      userId: 'u',
      min: 150,
      max: 150,
      cooldownSeconds: 60,
      now: t0 + 30_000,
    });
    expect(blocked.awarded).toBe(false);
    expect(blocked.xp).toBe(150);

    // After the cooldown — awarded again, crosses into level 2 (>= 255).
    const second = await awardXp({
      guildId: GUILD,
      userId: 'u',
      min: 150,
      max: 150,
      cooldownSeconds: 60,
      now: t0 + 61_000,
    });
    expect(second).toMatchObject({ awarded: true, xp: 300, level: 2, leveledUp: true });

    const row = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId: GUILD, userId: 'u' } },
    });
    expect(row?.messages).toBe(2);
  });
});
