import type { ReactNode } from 'react';
import { Clock, RefreshCw, Timer, Users } from 'lucide-react';
import { fivemConnectAddress, nextRestart, type FivemConfig } from '@refx/shared';
import type { FivemStatusRead } from '../lib/fivem-status';
import { cn } from '../lib/utils';
import { GlassCard } from './ui/glass-card';
import { CopyButton, FivemPanelActions } from './fivem-panel-actions';

/** "2d 4h", "3h 12m", "14m", "<1m". */
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return '<1m';
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** "just now", "42s ago", "3m ago", "2h ago". */
function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

/** Wall-clock time in the city's timezone, e.g. "Tue 06:00 EST". */
function formatZoned(date: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  };
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(date);
  }
}

/** FiveM hostnames carry ^0–^9 colour codes; strip them for display. */
function stripColourCodes(value: string): string {
  return value.replace(/\^\d/g, '').trim();
}

function emptyMessage(status: FivemStatusRead, moduleEnabled: boolean, host: string): string {
  if (status.kind === 'error') {
    return 'Could not read the live status right now (Redis unreachable). The settings below still save normally.';
  }
  if (!moduleEnabled) {
    return 'The FiveM City module is off. Turn it on from the Overview, set the server host below, and the bot will start polling.';
  }
  if (!host.trim()) {
    return 'Set the server host below and save. The bot starts polling on its next cycle.';
  }
  return 'Waiting for the first poll of the server…';
}

/**
 * Live city status at the top of the FiveM page, from the bot's latest poll in
 * Redis. Rendered on the server (all times are computed against `now` here, so
 * nothing re-formats on the client); the buttons + auto-refresh are a small
 * client island.
 */
export function FivemStatusCard({
  guildId,
  config,
  status,
  moduleEnabled,
  now,
}: {
  guildId: string;
  config: FivemConfig;
  status: FivemStatusRead;
  moduleEnabled: boolean;
  /** ISO render time (server clock). */
  now: string;
}) {
  const nowMs = Date.parse(now);
  const snapshot = status.kind === 'ok' ? status.snapshot : null;
  const connect = fivemConnectAddress(config);
  const restart = nextRestart(config, new Date(nowMs));
  const checkedMs = snapshot ? nowMs - Date.parse(snapshot.checkedAt) : 0;
  // Three missed polls (min 3 minutes) means the bot isn't updating the snapshot.
  const stale =
    snapshot !== null && checkedMs > Math.max(3 * config.pollIntervalSeconds, 180) * 1_000;

  const tone = !snapshot ? 'unknown' : snapshot.online ? 'online' : 'offline';
  const players = snapshot?.online ? snapshot.players : [];
  const shownPlayers = players.slice(0, 16);
  const hostname = snapshot?.hostname ? stripColourCodes(snapshot.hostname) : '';

  return (
    <GlassCard className="relative overflow-hidden p-5">
      {/* Status-coloured glow behind the header. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full opacity-25 blur-3xl',
          tone === 'online' && 'bg-[var(--color-success)]',
          tone === 'offline' && 'bg-[var(--color-danger)]',
          tone === 'unknown' && 'bg-[var(--color-brand)]',
        )}
      />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'h-2.5 w-2.5 shrink-0 rounded-full',
                tone === 'online' && 'dot-pulse bg-[var(--color-success)]',
                tone === 'offline' && 'bg-[var(--color-danger)]',
                tone === 'unknown' && 'bg-white/30',
              )}
            />
            <span
              className={cn(
                'text-xs font-bold uppercase tracking-[0.18em]',
                tone === 'online' && 'text-[var(--color-success)]',
                tone === 'offline' && 'text-[var(--color-danger)]',
                tone === 'unknown' && 'text-white/45',
              )}
            >
              {tone === 'online' ? 'City online' : tone === 'offline' ? 'City offline' : 'No status yet'}
            </span>
          </div>
          <h3 className="mt-1.5 truncate text-xl font-semibold text-white">{config.serverName}</h3>
          {hostname && hostname !== config.serverName && (
            <p className="truncate text-xs text-white/40">{hostname}</p>
          )}
        </div>
        <FivemPanelActions guildId={guildId} />
      </div>

      {status.kind !== 'ok' && (
        <p className="relative mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white/60">
          {emptyMessage(status, moduleEnabled, config.host)}
        </p>
      )}

      {stale && (
        <p className="relative mt-4 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-2.5 text-sm text-[var(--color-warning)]">
          This status is {formatAgo(checkedMs).replace(' ago', '')} old. The bot may be offline or
          the module disabled.
        </p>
      )}

      <div className="relative mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<Users className="h-3.5 w-3.5" />}
          label="Players"
          value={snapshot ? `${players.length} / ${snapshot.maxPlayers || '—'}` : '—'}
        />
        <Stat
          icon={<Timer className="h-3.5 w-3.5" />}
          label="Uptime"
          value={
            snapshot?.online && snapshot.onlineSince
              ? formatDuration(nowMs - Date.parse(snapshot.onlineSince))
              : '—'
          }
        />
        <Stat
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          label="Last checked"
          value={snapshot ? formatAgo(checkedMs) : '—'}
        />
        <Stat
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Next restart"
          value={restart ? `in ${formatDuration(restart.getTime() - nowMs)}` : 'None set'}
          sub={restart ? formatZoned(restart, config.timezone) : undefined}
        />
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/35">F8</span>
        {connect ? (
          <>
            <code className="min-w-0 flex-1 truncate font-mono text-sm text-[var(--color-brand-bright)]">
              connect {connect}
            </code>
            <CopyButton text={`connect ${connect}`} />
          </>
        ) : (
          <span className="flex-1 text-sm text-white/40">Set a host or connect address below.</span>
        )}
        {config.joinCode.trim() && (
          <a
            href={`https://cfx.re/join/${encodeURIComponent(config.joinCode.trim())}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
          >
            cfx.re/join/{config.joinCode.trim()}
          </a>
        )}
      </div>

      {shownPlayers.length > 0 && (
        <div className="relative mt-4 flex flex-wrap gap-1.5">
          {shownPlayers.map((player) => (
            <span
              key={player.id}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-white/70"
            >
              <span className="font-mono text-white/35">{player.id}</span> {player.name}
            </span>
          ))}
          {players.length > shownPlayers.length && (
            <span className="px-1.5 py-0.5 text-xs text-white/40">
              +{players.length - shownPlayers.length} more
            </span>
          )}
        </div>
      )}
    </GlassCard>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-semibold text-white/90">{value}</p>
      {sub && <p className="truncate text-[11px] text-white/40">{sub}</p>}
    </div>
  );
}
