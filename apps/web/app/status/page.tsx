import type { Metadata } from 'next';
import { Activity, Bot, CreditCard, Database, Gauge, Server } from 'lucide-react';
import { BRAND } from '@solari/shared';
import { GlassCard } from '../../components/ui/glass-card';
import { SiteNav } from '../../components/marketing/site-nav';
import { SiteFooter } from '../../components/marketing/site-footer';
import { StatusRefresh } from '../../components/status-refresh';
import {
  fetchShardStatuses,
  fetchUptimeHistory,
  formatUptime,
  type UptimeDay,
} from '../../lib/bot-status';
import { checkDatabase, checkRedis } from '../../lib/status-checks';
import { isBillingConfigured } from '../../lib/stripe';
import { cn } from '../../lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Status — ${BRAND.name}`,
  description: `Live operational status of the ${BRAND.name} bot, dashboard, and services.`,
};

type Health = 'operational' | 'degraded' | 'outage';

const HEALTH_META: Record<Health, { label: string; dot: string; text: string }> = {
  operational: {
    label: 'Operational',
    dot: 'bg-[var(--color-success)] shadow-[0_0_10px_var(--color-success)]',
    text: 'text-[var(--color-success)]',
  },
  degraded: {
    label: 'Degraded',
    dot: 'bg-[var(--color-warning)] shadow-[0_0_10px_var(--color-warning)]',
    text: 'text-[var(--color-warning)]',
  },
  outage: {
    label: 'Outage',
    dot: 'bg-[var(--color-danger)] shadow-[0_0_10px_var(--color-danger)]',
    text: 'text-[var(--color-danger)]',
  },
};

/** Gateway ping past this reads as degraded rather than healthy. */
const DEGRADED_PING_MS = 400;

export default async function StatusPage() {
  const [shards, db, redis, history] = await Promise.all([
    fetchShardStatuses(),
    checkDatabase(),
    checkRedis(),
    fetchUptimeHistory(90),
  ]);

  const reporting = shards ?? [];
  const totalGuilds = reporting.reduce((sum, shard) => sum + shard.guilds, 0);
  const pings = reporting.filter((s) => s.ping >= 0).map((s) => s.ping);
  const avgPing = pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null;
  const longestUptime = reporting.reduce((max, s) => Math.max(max, s.uptimeMs), 0);

  // Bot health: no heartbeat = outage (unless Redis itself is down, in which
  // case we can't tell — call it degraded rather than crying wolf).
  const botHealth: Health =
    reporting.length > 0
      ? avgPing !== null && avgPing > DEGRADED_PING_MS
        ? 'degraded'
        : 'operational'
      : shards === null
        ? 'degraded'
        : 'outage';

  const dbHealth: Health = db.ok ? 'operational' : 'outage';
  const redisHealth: Health = redis.ok ? 'operational' : 'outage';
  const billingConfigured = isBillingConfigured();

  const components: {
    name: string;
    description: string;
    icon: typeof Bot;
    health: Health;
    detail: string;
  }[] = [
    {
      name: 'Discord bot',
      description: 'Gateway connection, commands & events',
      icon: Bot,
      health: botHealth,
      detail:
        reporting.length > 0
          ? `${reporting.length} shard${reporting.length === 1 ? '' : 's'} · ${avgPing !== null ? `${avgPing}ms gateway` : 'ping pending'}`
          : shards === null
            ? 'heartbeat unreadable'
            : 'no heartbeat in 90s',
    },
    {
      name: 'Dashboard & API',
      description: 'This site, OAuth login & server actions',
      icon: Gauge,
      health: 'operational', // it rendered this page
      detail: 'serving',
    },
    {
      name: 'Database',
      description: 'PostgreSQL — configs, levels, economy, cases',
      icon: Database,
      health: dbHealth,
      detail: db.latencyMs !== null ? `${db.latencyMs}ms query` : 'unreachable',
    },
    {
      name: 'Cache & jobs',
      description: 'Redis — config cache, live updates, schedulers',
      icon: Activity,
      health: redisHealth,
      detail: redis.latencyMs !== null ? `${redis.latencyMs}ms ping` : 'unreachable',
    },
    ...(billingConfigured
      ? [
          {
            name: 'Billing',
            description: 'Stripe checkout & webhooks',
            icon: CreditCard,
            health: 'operational' as Health,
            detail: 'checkout enabled',
          },
        ]
      : []),
  ];

  const overall: Health = components.some((c) => c.health === 'outage')
    ? 'outage'
    : components.some((c) => c.health === 'degraded')
      ? 'degraded'
      : 'operational';
  const overallMeta = HEALTH_META[overall];

  const overallCopy: Record<Health, string> = {
    operational: 'All systems operational',
    degraded: 'Partial degradation',
    outage: 'Service disruption',
  };

  return (
    <div className="min-h-screen">
      <SiteNav />
      <StatusRefresh seconds={30} />

      <main className="mx-auto max-w-3xl px-6 py-12">
        {/* Overall banner */}
        <GlassCard
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 border p-6',
            overall === 'operational' && 'border-[var(--color-success)]/25',
            overall === 'degraded' && 'border-[var(--color-warning)]/30',
            overall === 'outage' && 'border-[var(--color-danger)]/30',
          )}
        >
          <div className="flex items-center gap-3">
            <span className={cn('h-3.5 w-3.5 rounded-full', overallMeta.dot)} />
            <h1 className="text-xl font-semibold text-white">{overallCopy[overall]}</h1>
          </div>
          <p className="font-mono text-xs text-white/40">
            live · refreshes every 30s
          </p>
        </GlassCard>

        {/* Stats strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Servers" value={reporting.length ? totalGuilds.toLocaleString() : '—'} />
          <Stat label="Shards" value={reporting.length ? String(reporting.length) : '—'} />
          <Stat label="Gateway ping" value={avgPing !== null ? `${avgPing}ms` : '—'} />
          <Stat label="Uptime" value={longestUptime ? formatUptime(longestUptime) : '—'} />
        </div>

        {/* Uptime history (bot heartbeat ledger) */}
        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wider text-white/40">
          Bot uptime — last 90 days
        </h2>
        <UptimeHistory history={history} />

        {/* Components */}
        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wider text-white/40">
          Components
        </h2>
        <GlassCard className="divide-y divide-white/5 p-0">
          {components.map((component) => {
            const meta = HEALTH_META[component.health];
            const Icon = component.icon;
            return (
              <div key={component.name} className="flex items-center gap-4 px-5 py-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-white/60">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white/90">{component.name}</p>
                  <p className="truncate text-xs text-white/45">{component.description}</p>
                </div>
                <span className="hidden font-mono text-xs text-white/35 sm:block">
                  {component.detail}
                </span>
                <span className={cn('flex items-center gap-1.5 text-sm font-medium', meta.text)}>
                  <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
                  {meta.label}
                </span>
              </div>
            );
          })}
        </GlassCard>

        {/* Per-shard detail */}
        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wider text-white/40">
          Shards
        </h2>
        {reporting.length === 0 ? (
          <GlassCard className="p-6 text-sm text-white/45">
            {shards === null
              ? 'Shard heartbeats are unreadable right now (cache unreachable).'
              : 'No shard has reported in the last 90 seconds.'}
          </GlassCard>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {reporting.map((shard) => {
              const shardHealth: Health =
                shard.ping >= 0 && shard.ping > DEGRADED_PING_MS ? 'degraded' : 'operational';
              const meta = HEALTH_META[shardHealth];
              return (
                <GlassCard key={shard.shardId} className="flex items-center gap-3 p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-white/60">
                    <Server className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-medium text-white/90">
                      Shard {shard.shardId}
                    </p>
                    <p className="font-mono text-xs text-white/40">
                      {shard.ping >= 0 ? `${shard.ping}ms` : '—'} ·{' '}
                      {shard.guilds.toLocaleString()} servers · up {formatUptime(shard.uptimeMs)}
                    </p>
                  </div>
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dot)} />
                </GlassCard>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-center font-mono text-xs text-white/25">
          Checks run live from this page render — database and cache latencies are real round trips.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}

/** Average uptime over the trailing `days` window, ignoring no-data days. */
function windowPct(history: UptimeDay[], days: number): string {
  const window = history.slice(-days).filter((day) => day.pct !== null);
  if (window.length === 0) return '—';
  const avg = window.reduce((sum, day) => sum + (day.pct ?? 0), 0) / window.length;
  return `${(Math.round(avg * 100) / 100).toFixed(2)}%`;
}

function barColor(pct: number | null): string {
  if (pct === null) return 'bg-white/[0.08]';
  if (pct >= 99) return 'bg-[var(--color-success)]/80';
  if (pct >= 95) return 'bg-[var(--color-warning)]/80';
  return 'bg-[var(--color-danger)]/80';
}

function UptimeHistory({ history }: { history: UptimeDay[] | null }) {
  if (!history) {
    return (
      <GlassCard className="p-6 text-sm text-white/45">
        Uptime history is unreadable right now (cache unreachable).
      </GlassCard>
    );
  }
  const hasData = history.some((day) => day.pct !== null);
  return (
    <GlassCard className="p-5">
      <div className="flex h-9 items-end gap-[2px]">
        {history.map((day) => (
          <span
            key={day.date}
            title={`${day.date} — ${day.pct === null ? 'no data' : `${day.pct}% uptime`}`}
            className={cn('h-full flex-1 rounded-[2px] transition-colors', barColor(day.pct))}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-white/35">
        <span>{history[0]?.date}</span>
        <span>today</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/5 pt-4 text-center">
        <div>
          <p className="font-mono text-lg font-semibold text-white/90">{windowPct(history, 1)}</p>
          <p className="text-[11px] uppercase tracking-wide text-white/40">today</p>
        </div>
        <div>
          <p className="font-mono text-lg font-semibold text-white/90">{windowPct(history, 7)}</p>
          <p className="text-[11px] uppercase tracking-wide text-white/40">7 days</p>
        </div>
        <div>
          <p className="font-mono text-lg font-semibold text-white/90">{windowPct(history, 90)}</p>
          <p className="text-[11px] uppercase tracking-wide text-white/40">90 days</p>
        </div>
      </div>
      {!hasData && (
        <p className="mt-3 text-xs text-white/35">
          History starts recording from the bot&rsquo;s next boot — bars fill in day by day.
        </p>
      )}
    </GlassCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold text-white/90">{value}</p>
    </GlassCard>
  );
}
