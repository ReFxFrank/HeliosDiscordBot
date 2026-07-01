import type { EmbedBuilder, GuildMember, VoiceBasedChannel } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import type { Player, Track } from 'lavalink-client';
import type { MusicConfig } from '@solari/shared';
import { brandedEmbed } from './embeds';

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
