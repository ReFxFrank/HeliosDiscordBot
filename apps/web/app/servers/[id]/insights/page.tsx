import Link from 'next/link';
import { prisma } from '@refx/database';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { compactNumber, fetchGuildInsights, parseRange } from '../../../../lib/insights';
import { GlassCard } from '../../../../components/ui/glass-card';
import { ActivityChart } from '../../../../components/insights/activity-chart';
import { memberAvatarUrl } from '../../../../components/leaderboard-list';
import { cn } from '../../../../lib/utils';

export const dynamic = 'force-dynamic';

// Series colors validated against the card surface (#0b1322) with the dataviz
// palette checks: ReFx blue alone on single-series charts; the blue/red pair
// (CVD ΔE 66) only co-occurs on the joins-vs-leaves chart.
const BRAND_BLUE = '#3d95ff';
const BLUE = '#3987e5';
const RED = '#e66767';

const RANGES = [7, 30, 90] as const;

export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { id } = await params;
  await guardGuildAccess(id);
  const range = parseRange((await searchParams).range);

  const [insights, topMembers, entities] = await Promise.all([
    fetchGuildInsights(id, range),
    prisma.userLevel.findMany({
      where: { guildId: id },
      orderBy: { messages: 'desc' },
      take: 8,
    }),
    getGuildEntities(id).catch(() => ({ roles: [], channels: [] })),
  ]);

  const channelName = new Map(entities.channels.map((c) => [c.id, c.name]));
  const labels = insights.days.map((d) => d.date);
  const netMembers = insights.totals.joins - insights.totals.leaves;
  const messagesDelta =
    insights.prevTotals.messages > 0
      ? Math.round(
          ((insights.totals.messages - insights.prevTotals.messages) /
            insights.prevTotals.messages) *
            100,
        )
      : null;
  const hasMemberCurve = insights.days.some((d) => d.memberCount > 0);
  const maxChannel = insights.topChannels[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white/90">Insights</h2>
          <p className="text-sm text-white/50">
            Activity across the last {range} days (UTC). Collection runs while the bot is online.
          </p>
        </div>
        {/* One filter row scoping everything below it. */}
        <div className="flex items-center gap-1 rounded-full border border-white/10 p-1">
          {RANGES.map((preset) => (
            <Link
              key={preset}
              href={`/servers/${id}/insights?range=${preset}`}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                preset === range
                  ? 'bg-[var(--color-brand)]/25 text-white'
                  : 'text-white/50 hover:text-white/80',
              )}
            >
              {preset}d
            </Link>
          ))}
        </div>
      </div>

      {insights.empty ? (
        <GlassCard className="p-10 text-center text-sm text-white/40">
          No activity recorded yet — insights start collecting once the bot sees messages and
          joins. Check back tomorrow.
        </GlassCard>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile
              label="Messages"
              value={compactNumber(insights.totals.messages)}
              delta={messagesDelta}
              deltaUpIsGood
            />
            <StatTile label="Peak active / day" value={compactNumber(insights.totals.peakActive)} />
            <StatTile label="Joins" value={compactNumber(insights.totals.joins)} />
            <StatTile label="Leaves" value={compactNumber(insights.totals.leaves)} />
            <StatTile
              label="Net members"
              value={`${netMembers >= 0 ? '+' : ''}${compactNumber(netMembers)}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ActivityChart
              title="Messages per day"
              labels={labels}
              series={[
                { name: 'Messages', color: BRAND_BLUE, values: insights.days.map((d) => d.messages) },
              ]}
            />
            <ActivityChart
              title="Active members per day"
              labels={labels}
              series={[
                {
                  name: 'Active members',
                  color: BRAND_BLUE,
                  values: insights.days.map((d) => d.activeMembers),
                },
              ]}
            />
            <ActivityChart
              title="Joins vs leaves"
              labels={labels}
              series={[
                { name: 'Joins', color: BLUE, values: insights.days.map((d) => d.joins) },
                { name: 'Leaves', color: RED, values: insights.days.map((d) => d.leaves) },
              ]}
            />
            {hasMemberCurve ? (
              <ActivityChart
                title="Member growth"
                labels={labels}
                series={[
                  {
                    name: 'Members',
                    color: BRAND_BLUE,
                    values: insights.days.map((d) => d.memberCount),
                  },
                ]}
              />
            ) : (
              <GlassCard className="flex items-center justify-center p-10 text-center text-sm text-white/40">
                Member growth appears after the first daily snapshot.
              </GlassCard>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top channels */}
            <GlassCard className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-white/85">
                Top channels ({range}d)
              </h3>
              {insights.topChannels.length === 0 ? (
                <p className="py-6 text-center text-sm text-white/40">No messages counted yet.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {insights.topChannels.map((channel) => (
                    <div key={channel.channelId} className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate text-white/75">
                        #{channelName.get(channel.channelId) ?? channel.channelId}
                      </span>
                      <span className="h-2 w-40 shrink-0 overflow-hidden rounded-full bg-white/[0.05] sm:w-56">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${maxChannel > 0 ? Math.max(3, (channel.count / maxChannel) * 100) : 0}%`,
                            backgroundColor: BRAND_BLUE,
                          }}
                        />
                      </span>
                      <span
                        className="w-12 shrink-0 text-right text-xs text-white/50"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {compactNumber(channel.count)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            {/* Top members (all-time — from leveling's message counters) */}
            <GlassCard className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-white/85">Top members (all-time)</h3>
              {topMembers.length === 0 ? (
                <p className="py-6 text-center text-sm text-white/40">
                  Fills up as members chat (tracked by the Levels module).
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {topMembers.map((member, index) => (
                    <div key={member.userId} className="flex items-center gap-3 text-sm">
                      <span className="w-5 text-right font-mono text-xs text-white/35">
                        {index + 1}
                      </span>
                      {/* Discord CDN avatar; plain img matches leaderboard-list. */}
                      <img
                        src={memberAvatarUrl(member.userId, member.avatar)}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded-full"
                      />
                      <span className="min-w-0 flex-1 truncate text-white/75">
                        {member.username ?? member.userId}
                      </span>
                      <span
                        className="text-xs text-white/50"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {compactNumber(member.messages)} msgs
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  delta,
  deltaUpIsGood,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaUpIsGood?: boolean;
}) {
  const showDelta = delta !== undefined && delta !== null;
  const good = showDelta && (delta >= 0) === Boolean(deltaUpIsGood);
  return (
    <GlassCard className="p-4">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {showDelta && (
        <p
          className={cn(
            'mt-0.5 flex items-center gap-1 text-xs',
            good ? 'text-[#0ca30c]' : 'text-[#e66767]',
          )}
        >
          {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta >= 0 ? '+' : ''}
          {delta}% vs previous period
        </p>
      )}
    </GlassCard>
  );
}
