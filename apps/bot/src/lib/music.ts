import type { EmbedBuilder, GuildMember, VoiceBasedChannel } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import type { Player, SearchResult, Track, UnresolvedTrack } from 'lavalink-client';
import type { MusicConfig, MusicSearchSource } from '@solari/shared';
import { brandedEmbed } from './embeds';

// ── Multi-source search fallback ─────────────────────────────────────────────

/** Human names for search sources (fallback notices, dashboard parity). */
export const SOURCE_NAMES: Record<MusicSearchSource, string> = {
  scsearch: 'SoundCloud',
  ytsearch: 'YouTube',
  ytmsearch: 'YouTube Music',
  spsearch: 'Spotify',
};

/** The Lavalink `sourceName` a track carries per search prefix. */
const PREFIX_SOURCE_NAME: Record<MusicSearchSource, string> = {
  scsearch: 'soundcloud',
  ytsearch: 'youtube',
  ytmsearch: 'youtube',
  spsearch: 'spotify',
};

/**
 * Sources tried when the preferred one has no result (or a track fails at
 * playback). Directly-streamable sources only — Spotify resolves metadata, not
 * audio, so it's a search choice but never a fallback target.
 */
const FALLBACK_SOURCES: MusicSearchSource[] = ['scsearch', 'ytsearch'];

/** The preferred source first, then the remaining streamable fallbacks. */
export function searchChain(preferred: MusicSearchSource): MusicSearchSource[] {
  return [preferred, ...FALLBACK_SOURCES.filter((source) => source !== preferred)];
}

const usable = (result: SearchResult): boolean =>
  result.loadType !== 'error' && result.loadType !== 'empty' && result.tracks.length > 0;

/**
 * Search the preferred source, then fall through the chain until something
 * loads. Returns the winning source so callers can say "found via YouTube".
 * URLs resolve on their own source — no chain (retrying a URL as text on
 * other sources would return unrelated matches).
 */
export async function searchWithFallback(
  player: Player,
  query: string,
  preferred: MusicSearchSource,
  requester: TrackRequester,
): Promise<{ result: SearchResult; source: MusicSearchSource } | null> {
  if (/^https?:\/\//i.test(query)) {
    const result = (await player.search({ query }, requester)) as SearchResult;
    return usable(result) ? { result, source: preferred } : null;
  }
  for (const source of searchChain(preferred)) {
    try {
      const result = (await player.search({ query, source }, requester)) as SearchResult;
      if (usable(result)) return { result, source };
    } catch {
      // Node/source hiccup — try the next one.
    }
  }
  return null;
}

/**
 * Re-find a failed track on the other streamable sources (by title + author).
 * Returns the replacement (flagged in userData so a fallback can never chain
 * into another fallback), or null when nowhere has it.
 */
export async function findFallbackTrack(
  player: Player,
  failed: Track | UnresolvedTrack,
): Promise<{ track: Track; source: MusicSearchSource } | null> {
  if ((failed.userData as { fallback?: number } | undefined)?.fallback) return null;
  const info = failed.info;
  if (!info?.title) return null;

  const failedSource = info.sourceName ?? '';
  const query = [info.title, info.author ?? ''].join(' ').trim();
  for (const source of FALLBACK_SOURCES) {
    if (PREFIX_SOURCE_NAME[source] === failedSource) continue;
    try {
      const result = (await player.search({ query, source }, failed.requester)) as SearchResult;
      const track = usable(result) ? result.tracks[0] : undefined;
      if (track) {
        track.userData = { ...(track.userData ?? {}), fallback: 1 };
        return { track: track as Track, source };
      }
    } catch {
      // Try the next source.
    }
  }
  return null;
}

/** What we attach as the track requester and read back for attribution. */
export interface TrackRequester {
  id: string;
  username: string;
}

export function requesterOf(track: Track): TrackRequester | null {
  const r = track.requester as TrackRequester | undefined;
  return r && typeof r.id === 'string' ? r : null;
}

/** Format a millisecond duration as `h:mm:ss` / `m:ss`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

/** Text progress bar for the now-playing position. */
export function progressBar(position: number, duration: number, size = 18): string {
  if (duration <= 0) return '🔴 LIVE';
  const ratio = Math.min(1, Math.max(0, position / duration));
  const filled = Math.round(ratio * size);
  return `${'▬'.repeat(filled)}🔘${'▬'.repeat(Math.max(0, size - filled))}`;
}

function trackLine(track: Track): string {
  const { title, uri, isStream, duration } = track.info;
  const length = isStream ? 'LIVE' : formatDuration(duration);
  return `**[${title}](${uri})** \`${length}\``;
}

export function nowPlayingEmbed(track: Track, player: Player): EmbedBuilder {
  const req = requesterOf(track);
  const embed = brandedEmbed({ kind: 'info', title: '🎵 Now playing' }).setDescription(
    `${trackLine(track)}\n\n${progressBar(player.position, track.info.duration)}`,
  );
  if (track.info.author) embed.addFields({ name: 'Artist', value: track.info.author, inline: true });
  if (req) embed.addFields({ name: 'Requested by', value: `<@${req.id}>`, inline: true });
  if (track.info.artworkUrl) embed.setThumbnail(track.info.artworkUrl);
  return embed;
}

export function queuedEmbed(track: Track, positionInQueue: number): EmbedBuilder {
  return brandedEmbed({ kind: 'success', title: '➕ Added to queue' })
    .setDescription(`${trackLine(track)}\n\nPosition in queue: **#${positionInQueue}**`)
    .setThumbnail(track.info.artworkUrl ?? null);
}

/** Render the current queue as an embed (10 upcoming tracks per page). */
export function queueEmbed(player: Player, page: number): EmbedBuilder {
  const perPage = 10;
  const upcoming = player.queue.tracks;
  const totalPages = Math.max(1, Math.ceil(upcoming.length / perPage));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const start = (clamped - 1) * perPage;
  const slice = upcoming.slice(start, start + perPage);

  const lines = slice.map((t, i) => `\`${start + i + 1}.\` ${trackLine(t as Track)}`);
  const embed = brandedEmbed({ kind: 'default', title: '🎶 Queue' });

  const current = player.queue.current;
  if (current) {
    embed.addFields({ name: 'Now playing', value: trackLine(current) });
  }
  embed.setDescription(lines.length > 0 ? lines.join('\n') : '_Nothing queued._');

  const totalMs = upcoming.reduce((sum, t) => sum + (t.info.duration || 0), 0);
  embed.setFooter({
    text: `Page ${clamped}/${totalPages} · ${upcoming.length} track(s) · ${formatDuration(totalMs)} remaining`,
  });
  return embed;
}

// ── DJ / control model ──────────────────────────────────────────────────────

/** DJ power = Manage Server, or one of the configured DJ roles. */
export function hasDjPower(member: GuildMember, config: MusicConfig): boolean {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return config.djRoleIds.some((id) => member.roles.cache.has(id));
}

/** May run control commands (stop/pause/volume/…): DJ/mod, or open when no DJ role is set. */
export function isController(member: GuildMember, config: MusicConfig): boolean {
  return hasDjPower(member, config) || config.djRoleIds.length === 0;
}

/** May add tracks: everyone, unless `djOnly` restricts it to DJs/mods. */
export function canQueue(member: GuildMember, config: MusicConfig): boolean {
  return !config.djOnly || hasDjPower(member, config);
}

/** Non-bot members currently in a voice channel. */
export function humanListeners(channel: VoiceBasedChannel | null | undefined): number {
  if (!channel) return 0;
  return channel.members.filter((m) => !m.user.bot).size;
}

// ── Vote-skip (per-guild, in-memory, per shard) ─────────────────────────────

const skipVotes = new Map<string, Set<string>>();

/** Record a vote to skip; returns the current vote count. */
export function addSkipVote(guildId: string, userId: string): number {
  let set = skipVotes.get(guildId);
  if (!set) {
    set = new Set();
    skipVotes.set(guildId, set);
  }
  set.add(userId);
  return set.size;
}

export function clearSkipVotes(guildId: string): void {
  skipVotes.delete(guildId);
}

/** Votes required to skip, given listeners and the configured ratio. */
export function votesNeeded(listeners: number, ratio: number): number {
  return Math.max(1, Math.ceil(listeners * ratio));
}
