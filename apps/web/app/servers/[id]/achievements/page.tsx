import { prisma } from '@solari/database';
import { achievementsConfigSchema } from '@solari/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { AchievementsForm } from '../../../../components/achievements-form';

export const dynamic = 'force-dynamic';

export default async function AchievementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, { roles, channels }] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'ACHIEVEMENTS' } },
      select: { config: true },
    }),
    getGuildEntities(id),
  ]);
  const initial = achievementsConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Achievements</h2>
        <p className="text-sm text-white/50">
          Milestone rewards for level, messages, coins, and voice time.
        </p>
      </div>
      <AchievementsForm guildId={id} initial={initial} roles={roles} channels={channels} />
    </div>
  );
}
