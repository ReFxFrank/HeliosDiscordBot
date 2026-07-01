import Link from 'next/link';
import { prisma } from '@solari/database';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { PersonalizerForm } from '../../../../components/personalizer-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function PersonalizerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [guild, row] = await Promise.all([
    prisma.guild.findUnique({ where: { id }, select: { premiumTier: true } }),
    prisma.customBot.findUnique({
      where: { guildId: id },
      select: {
        applicationId: true,
        botName: true,
        avatarUrl: true,
        bannerUrl: true,
        status: true,
        activityType: true,
        activityText: true,
        streamUrl: true,
        enabled: true,
        // Read ONLY to derive `hasToken` below — never forwarded to the client.
        tokenEnc: true,
      },
    }),
  ]);

  if (guild?.premiumTier !== 'PREMIUM') {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-semibold text-white/90">Bot Personalizer</h2>
          <p className="text-sm text-white/50">
            Run Solari under your own bot — your name, avatar, and presence.
          </p>
        </div>
        <GlassCard className="p-6">
          <h3 className="text-base font-semibold text-white/90">A Premium feature</h3>
          <p className="mt-1.5 max-w-prose text-sm text-white/50">
            The Bot Personalizer lets you serve every command from your own branded bot user.
            Upgrade this server to Premium to set it up.
          </p>
          <Link
            href={`/servers/${id}/premium`}
            className="mt-4 inline-flex items-center rounded-lg bg-[var(--color-brand-strong)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-strong)]/85"
          >
            Upgrade to Premium
          </Link>
        </GlassCard>
      </div>
    );
  }

  // The token is a secret: only a boolean crosses the client boundary.
  const hasToken = Boolean(row?.tokenEnc);
  const initial = {
    applicationId: row?.applicationId ?? null,
    botName: row?.botName ?? null,
    avatarUrl: row?.avatarUrl ?? null,
    bannerUrl: row?.bannerUrl ?? null,
    status: row?.status ?? 'online',
    activityType: row?.activityType ?? null,
    activityText: row?.activityText ?? null,
    streamUrl: row?.streamUrl ?? null,
    enabled: row?.enabled ?? false,
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Bot Personalizer</h2>
        <p className="text-sm text-white/50">
          Run Solari under your own bot — your name, avatar, and presence. Saved changes restart
          your bot in ~1s.
        </p>
      </div>
      <PersonalizerForm guildId={id} initial={initial} hasToken={hasToken} />
    </div>
  );
}
