'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SkipForward, Trash2 } from 'lucide-react';
import type { TwitchChatConfig } from '@refx/shared';
import { songQueueAction } from '../../lib/twitch-chat-actions';
import { GlassCard } from '../ui/glass-card';
import { Field, inputClass } from '../ui/form';
import { NumberInput, PermissionSelect, ToggleRow, useSection } from './ui';

export interface SongItem {
  id: string;
  title: string;
  videoId: string;
  durationSeconds: number;
  requestedBy: string;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function CopyField({ label, value, hint }: { label: string; value: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <input
          readOnly
          className={`${inputClass} font-mono text-xs`}
          value={value}
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="shrink-0 rounded-lg border border-white/10 px-3 text-sm text-white/70 hover:text-white"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </Field>
  );
}

export function SongsEditor({
  guildId,
  config,
  playing,
  queue,
  volume,
  playerUrl,
  queueUrl,
}: {
  guildId: string;
  config: TwitchChatConfig;
  playing: SongItem | null;
  queue: SongItem[];
  volume: number;
  playerUrl: string;
  queueUrl: string;
}) {
  const router = useRouter();
  const { value: songs, update, bar } = useSection(guildId, 'songs', config.songs);
  const [vol, setVol] = useState(volume);
  const [pending, startTransition] = useTransition();
  const act = (action: 'remove' | 'skip' | 'clear' | 'volume', value?: string | number) =>
    startTransition(async () => {
      await songQueueAction(guildId, action, value);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-col gap-4 p-5">
        <ToggleRow
          title="Song requests"
          description="Viewers add YouTube songs with !sr; the OBS player below plays them."
          checked={songs.enabled}
          onChange={(enabled) => update((prev) => ({ ...prev, enabled }))}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Who can request">
            <PermissionSelect
              value={songs.permission}
              onChange={(permission) => update((p) => ({ ...p, permission }))}
            />
          </Field>
          <Field label="Longest song (seconds)">
            <NumberInput
              value={songs.maxDurationSeconds}
              min={30}
              max={10_800}
              onChange={(maxDurationSeconds) => update((p) => ({ ...p, maxDurationSeconds }))}
            />
          </Field>
          <Field label="Songs per person in the queue">
            <NumberInput
              value={songs.maxPerUser}
              min={1}
              max={50}
              onChange={(maxPerUser) => update((p) => ({ ...p, maxPerUser }))}
            />
          </Field>
          <Field label="Queue size">
            <NumberInput
              value={songs.maxQueue}
              min={1}
              max={500}
              onChange={(maxQueue) => update((p) => ({ ...p, maxQueue }))}
            />
          </Field>
          <Field label="Votes to skip (!voteskip)">
            <NumberInput
              value={songs.voteSkipVotes}
              min={1}
              max={100}
              onChange={(voteSkipVotes) => update((p) => ({ ...p, voteSkipVotes }))}
            />
          </Field>
          <Field label="Starting volume">
            <NumberInput
              value={songs.volume}
              min={0}
              max={100}
              onChange={(volume) => update((p) => ({ ...p, volume }))}
            />
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleRow
            title="Allow search"
            description="!sr song name finds the first YouTube result."
            checked={songs.allowSearch}
            onChange={(allowSearch) => update((p) => ({ ...p, allowSearch }))}
          />
          <ToggleRow
            title="Only while live"
            checked={songs.liveOnly}
            onChange={(liveOnly) => update((p) => ({ ...p, liveOnly }))}
          />
        </div>
        {bar}
      </GlassCard>

      <GlassCard className="flex flex-col gap-3 p-5">
        <CopyField
          label="OBS player"
          value={playerUrl}
          hint="Add a Browser Source in OBS with this address (any size; it can sit off-screen). Keep it secret: anyone with it controls the player."
        />
        <CopyField
          label="Public queue page"
          value={queueUrl}
          hint="What !queue links to. Safe to share."
        />
      </GlassCard>

      <GlassCard className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white/90">Now playing</h3>
          <div className="flex items-center gap-2 text-xs text-white/60">
            Volume
            <input
              type="range"
              min={0}
              max={100}
              value={vol}
              onChange={(e) => setVol(Number(e.target.value))}
              onMouseUp={() => act('volume', vol)}
              onTouchEnd={() => act('volume', vol)}
            />
            <span className="w-8 text-right">{vol}</span>
          </div>
        </div>
        {playing ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <a
                href={`https://youtu.be/${playing.videoId}`}
                target="_blank"
                rel="noreferrer"
                className="truncate text-sm text-white/90 hover:underline"
              >
                {playing.title}
              </a>
              <p className="text-xs text-white/45">
                {clock(playing.durationSeconds)} · requested by {playing.requestedBy}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => act('skip')}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/75 hover:text-white"
            >
              <SkipForward className="h-4 w-4" /> Skip
            </button>
          </div>
        ) : (
          <p className="text-sm text-white/45">
            Nothing is playing. The OBS player starts the next song on its own.
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <h3 className="text-sm font-semibold text-white/90">Queue ({queue.length})</h3>
          {queue.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => window.confirm('Clear the whole queue?') && act('clear')}
              className="text-xs text-white/50 hover:text-[var(--color-danger)]"
            >
              Clear queue
            </button>
          )}
        </div>
        {queue.length === 0 && <p className="text-sm text-white/45">The queue is empty.</p>}
        {queue.map((song, index) => (
          <div
            key={song.id}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
          >
            <span className="w-6 shrink-0 text-xs text-white/40">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white/85">{song.title}</p>
              <p className="text-xs text-white/45">
                {clock(song.durationSeconds)} · {song.requestedBy}
              </p>
            </div>
            <button
              type="button"
              aria-label="Remove"
              disabled={pending}
              onClick={() => act('remove', song.id)}
              className="p-1 text-white/40 hover:text-[var(--color-danger)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </GlassCard>
    </div>
  );
}
