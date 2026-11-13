import Link from 'next/link';
import { prisma } from '@refx/database';
import { loadTwitchPage } from '../../../../../lib/twitch-page';
import { PageHeader } from '../../../../../components/twitch/ui';
import { GlassCard } from '../../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

const KINDS: Record<string, string> = {
  all: 'Everything',
  filter: 'Spam filters',
  blocked_term: 'Blocked terms',
  nuke: 'Nukes',
  rollback: 'Undos',
  command: 'Commands',
  quote: 'Quotes',
  dashboard: 'Dashboard changes',
};

export default async function TwitchLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { id } = await params;
  const { kind = 'all' } = await searchParams;
  await loadTwitchPage(id);

  const rows =
    kind === 'dashboard'
      ? (
          await prisma.dashboardAuditLog.findMany({
            where: { guildId: id, module: 'TWITCH_CHAT' },
            orderBy: { createdAt: 'desc' },
            take: 200,
          })
        ).map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          kind: 'dashboard',
          action: row.action,
          who: `Discord user ${row.userId}`,
          detail: row.action.replace(/^twitch\./, '').replace(/\./g, ' '),
        }))
      : (
          await prisma.twitchModLog.findMany({
            where: { guildId: id, ...(kind !== 'all' && KINDS[kind] ? { kind } : {}) },
            orderBy: { createdAt: 'desc' },
            take: 200,
          })
        ).map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          kind: row.kind,
          action: row.action,
          who: [row.userLogin, row.actor && row.actor !== 'bot' ? `by ${row.actor.startsWith('dashboard:') ? 'dashboard' : row.actor}` : '']
            .filter(Boolean)
            .join(' '),
          detail: row.detail,
        }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Logs">
        What the bot did in chat over the last 30 days, and who changed its settings.
      </PageHeader>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(KINDS).map(([key, label]) => (
          <Link
            key={key}
            href={`/servers/${id}/twitch/logs${key === 'all' ? '' : `?kind=${key}`}`}
            className={`rounded-full border px-3 py-1 text-xs ${kind === key ? 'border-[#9146FF]/60 bg-[#9146FF]/20 text-white' : 'border-white/10 text-white/55 hover:text-white'}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-white/40">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">What</th>
              <th className="px-4 py-2 font-medium">Who</th>
              <th className="px-4 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-white/45">
                  Nothing logged yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-white/5 align-top">
                <td className="whitespace-nowrap px-4 py-2 text-xs text-white/45">{row.createdAt.toLocaleString('en-US', { timeZone: 'UTC' })} UTC</td>
                <td className="whitespace-nowrap px-4 py-2 text-white/75">
                  {KINDS[row.kind] ?? row.kind} <span className="text-xs text-white/40">{row.action}</span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-white/65">{row.who}</td>
                <td className="px-4 py-2 text-white/70">{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
