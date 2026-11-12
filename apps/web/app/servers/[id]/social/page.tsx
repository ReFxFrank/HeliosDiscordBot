import { prisma } from '@refx/database';
import { SOCIAL_PLATFORMS, type SocialPlatform } from '@refx/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { SocialAlerts, type SocialAlertSummary } from '../../../../components/social-alerts';

export const dynamic = 'force-dynamic';

export default async function SocialAlertsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [rows, moduleRow, { roles, channels }] = await Promise.all([
    prisma.socialSubscription.findMany({ where: { guildId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'SOCIAL' } },
      select: { enabled: true },
    }),
    getGuildEntities(id),
  ]);
  const alerts: SocialAlertSummary[] = rows
    .filter((row) => (SOCIAL_PLATFORMS as readonly string[]).includes(row.platform))
    .map((row) => ({
      id: row.id,
      platform: row.platform as SocialPlatform,
      target: row.target,
      channelId: row.channelId,
      mentionRoleId: row.mentionRoleId,
      message: row.message,
      liveRoleId: row.liveRoleId,
      liveUserId: row.liveUserId,
      live: Boolean(row.liveMessageId),
    }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Social alerts</h2>
        <p className="text-sm text-white/50">
          Post in a channel when a Twitch stream goes live, or when a YouTube channel, subreddit,
          Bluesky account or RSS feed has something new. Twitch alerts show the stream preview, game
          and viewers, update while the stream runs, and change to a summary when it ends.
        </p>
      </div>
      <SocialAlerts
        guildId={id}
        alerts={alerts}
        roles={roles}
        channels={channels}
        twitchReady={Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET)}
        moduleEnabled={Boolean(moduleRow?.enabled)}
      />
    </div>
  );
}
