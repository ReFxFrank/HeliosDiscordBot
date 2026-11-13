'use client';

import type { TwitchChatConfig } from '@refx/shared';
import { GlassCard } from '../ui/glass-card';
import { Field, inputClass, monoInputClass } from '../ui/form';
import { Badge, useSection } from './ui';

const RIOT_REGIONS = [
  'na1',
  'euw1',
  'eun1',
  'kr',
  'jp1',
  'br1',
  'la1',
  'la2',
  'oc1',
  'tr1',
  'ru',
  'ph2',
  'sg2',
  'th2',
  'tw2',
  'vn2',
  'me1',
] as const;
const VALORANT_REGIONS = ['na', 'eu', 'ap', 'kr', 'latam', 'br'] as const;

export function IntegrationsEditor({
  guildId,
  config,
  keys,
}: {
  guildId: string;
  config: TwitchChatConfig;
  keys: { lastfm: boolean; riot: boolean; henrik: boolean };
}) {
  const { value, update, bar } = useSection(guildId, 'integrations', config.integrations);
  const set = (change: Partial<TwitchChatConfig['integrations']>) =>
    update((prev) => ({ ...prev, ...change }));
  const keyBadge = (ready: boolean, env: string) =>
    ready ? (
      <Badge tone="purple">key set</Badge>
    ) : (
      <Badge tone="warn">needs {env} on the server</Badge>
    );

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold text-white/90">Socials</h3>
        <p className="-mt-3 text-xs text-white/50">
          For $(youtube), $(tiktok) and $(mastodon): the latest post with its link.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="YouTube channel id" hint="Starts with UC…">
            <input
              className={monoInputClass}
              value={value.youtubeChannelId}
              onChange={(e) => set({ youtubeChannelId: e.target.value.trim() })}
            />
          </Field>
          <Field label="TikTok username">
            <input
              className={monoInputClass}
              value={value.tiktokUser}
              placeholder="thesleepyfroggo"
              onChange={(e) => set({ tiktokUser: e.target.value })}
            />
          </Field>
          <Field label="Mastodon account" hint="name@instance.social">
            <input
              className={monoInputClass}
              value={value.mastodon}
              onChange={(e) => set({ mastodon: e.target.value })}
            />
          </Field>
        </div>
      </GlassCard>

      <GlassCard className="flex flex-col gap-4 p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white/90">
          Last.fm {keyBadge(keys.lastfm, 'LASTFM_API_KEY')}
        </h3>
        <div className="max-w-sm">
          <Field label="Last.fm username" hint="For $(lastfm): what’s playing now.">
            <input
              className={monoInputClass}
              value={value.lastfmUser}
              onChange={(e) => set({ lastfmUser: e.target.value })}
            />
          </Field>
        </div>
      </GlassCard>

      <GlassCard className="flex flex-col gap-4 p-5">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white/90">
          Riot Games {keyBadge(keys.riot, 'RIOT_API_KEY')}{' '}
          <span className="text-xs font-normal text-white/40">Valorant:</span>{' '}
          {keyBadge(keys.henrik, 'HENRIKDEV_API_KEY')}
        </h3>
        <p className="-mt-3 text-xs text-white/50">
          For $(leagueoflegends), $(teamfighttactics) and $(valorant) ranks.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Riot ID" hint="Name#TAG">
            <input
              className={monoInputClass}
              value={value.riotId}
              placeholder="Froggo#NA1"
              onChange={(e) => set({ riotId: e.target.value })}
            />
          </Field>
          <Field label="League / TFT server">
            <select
              className={inputClass}
              value={value.riotRegion}
              onChange={(e) => set({ riotRegion: e.target.value as (typeof RIOT_REGIONS)[number] })}
            >
              {RIOT_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valorant region">
            <select
              className={inputClass}
              value={value.valorantRegion}
              onChange={(e) =>
                set({ valorantRegion: e.target.value as (typeof VALORANT_REGIONS)[number] })
              }
            >
              {VALORANT_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </GlassCard>
      {bar}
    </div>
  );
}
