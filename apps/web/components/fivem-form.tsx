'use client';

import { useEffect, useState, useTransition } from 'react';
import { fivemConfigSchema, fivemConnectAddress, type FivemConfig } from '@refx/shared';
import type { ChannelOption, RoleOption } from '../lib/discord-guild';
import { saveFivemConfig } from '../lib/config-actions';
import { ChannelSelect, RoleSelect } from './ui/entity-select';
import { Switch } from './ui/switch';
import { SettingsSection } from './ui/settings-section';
import { TokenListInput } from './ui/token-list-input';
import { Field, SaveBar, inputClass, monoInputClass, type SaveStatus } from './ui/form';

/** IANA zones for the timezone suggestions (empty on very old browsers). */
function timeZones(): string[] {
  try {
    return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch {
    return [];
  }
}

/** Integer from a number input; keeps the previous value while the field is blank/invalid. */
function toInt(raw: string, previous: number): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : previous;
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div>
        <p className="text-sm text-white/90">{title}</p>
        <p className="text-xs text-white/50">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function FivemForm({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: FivemConfig;
  roles: RoleOption[];
  channels: ChannelOption[];
}) {
  const [config, setConfig] = useState<FivemConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Filled after mount: the server and browser ICU zone lists differ, so
  // rendering them during SSR would cause a hydration mismatch.
  const [zones, setZones] = useState<string[]>([]);
  useEffect(() => setZones(timeZones()), []);

  function update<K extends keyof FivemConfig>(key: K, value: FivemConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
    setError(null);
  }

  function save(): void {
    // Validate against the shared schema first so the user sees *which* field
    // is wrong; the server action re-validates with the same schema.
    const parsed = fivemConfigSchema.safeParse({
      ...config,
      host: config.host.trim(),
      connectAddress: config.connectAddress.trim(),
      joinCode: config.joinCode.trim(),
      panelImageUrl: config.panelImageUrl.trim(),
      timezone: config.timezone.trim(),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? `${issue.path.join('.') || 'config'}: ${issue.message}` : 'Invalid settings.');
      setStatus('error');
      return;
    }
    startTransition(async () => {
      const result = await saveFivemConfig(guildId, parsed.data);
      if (result.ok) setConfig(parsed.data);
      else setError(result.error ?? null);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  const defaultConnect = fivemConnectAddress({ ...config, connectAddress: '' });

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Server"
        description="Where the city server lives. The bot polls its /info.json, /dynamic.json and /players.json."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Server name" hint="Shown as the panel title and in alerts.">
            <input
              className={inputClass}
              value={config.serverName}
              maxLength={100}
              onChange={(e) => update('serverName', e.target.value)}
            />
          </Field>
          <Field label="Poll interval (seconds)" hint="30–600. How often the bot checks the server.">
            <input
              type="number"
              min={30}
              max={600}
              className={inputClass}
              value={config.pollIntervalSeconds}
              onChange={(e) => update('pollIntervalSeconds', toInt(e.target.value, config.pollIntervalSeconds))}
            />
          </Field>
          <Field label="Host" hint="Public IP or hostname. Blank disables polling.">
            <input
              className={monoInputClass}
              placeholder="play.example.com"
              value={config.host}
              maxLength={255}
              onChange={(e) => update('host', e.target.value)}
            />
          </Field>
          <Field label="Port" hint="Game port (FiveM serves its JSON endpoints here). Default 30120.">
            <input
              type="number"
              min={1}
              max={65535}
              className={monoInputClass}
              value={config.port}
              onChange={(e) => update('port', toInt(e.target.value, config.port))}
            />
          </Field>
          <Field
            label="Connect address"
            hint="What players type after `connect` in F8. Blank uses the host (and port if not 30120)."
          >
            <input
              className={monoInputClass}
              placeholder={defaultConnect || 'play.example.com'}
              value={config.connectAddress}
              maxLength={255}
              onChange={(e) => update('connectAddress', e.target.value)}
            />
          </Field>
          <Field label="cfx.re join code" hint="The part after cfx.re/join/. Adds a Connect button to the panel.">
            <input
              className={monoInputClass}
              placeholder="abc123"
              value={config.joinCode}
              maxLength={32}
              onChange={(e) => update('joinCode', e.target.value)}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Status Panel"
        description="A self-updating status message (players, uptime, connect info) in a channel like #connect."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Panel channel" hint="Blank disables the panel.">
            <ChannelSelect
              channels={channels}
              only="text"
              placeholder="None"
              selected={config.panelChannelId ? [config.panelChannelId] : []}
              onChange={(ids) => update('panelChannelId', ids[0] ?? null)}
            />
          </Field>
          <Field label="Banner image URL" hint="Optional image at the bottom of the panel.">
            <input
              className={inputClass}
              placeholder="https://example.com/city-banner.png"
              value={config.panelImageUrl}
              onChange={(e) => update('panelImageUrl', e.target.value)}
            />
          </Field>
        </div>
        <p className="mt-4 text-xs text-white/40">
          After saving, use <span className="text-white/60">Refresh panel</span> above to update the
          message in place, or <span className="text-white/60">Post new panel</span> if it was deleted
          or you changed channels.
        </p>
      </SettingsSection>

      <SettingsSection
        title="Presence"
        description="Show the live player count as the bot's Discord status."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-5">
          <ToggleRow
            title="Show player count"
            description="e.g. “Playing 42/128 in the city”."
            checked={config.presenceEnabled}
            onChange={(next) => update('presenceEnabled', next)}
          />
          {config.presenceEnabled && (
            <Field
              label="Presence text"
              hint="Placeholders: {players} online players, {max} slots, {server} server name."
            >
              <input
                className={inputClass}
                value={config.presenceFormat}
                maxLength={120}
                onChange={(e) => update('presenceFormat', e.target.value)}
              />
            </Field>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Alerts & Restarts"
        description="Post when the city goes up or down, and warn players before scheduled restarts."
        defaultOpen={false}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Alerts channel" hint="e.g. #server-status. Blank disables alerts.">
            <ChannelSelect
              channels={channels}
              only="text"
              placeholder="None"
              selected={config.alertsChannelId ? [config.alertsChannelId] : []}
              onChange={(ids) => update('alertsChannelId', ids[0] ?? null)}
            />
          </Field>
          <Field label="Ping role" hint="Mentioned on up/down alerts. Blank pings nobody.">
            <RoleSelect
              roles={roles}
              placeholder="None"
              selected={config.alertsRoleId ? [config.alertsRoleId] : []}
              onChange={(ids) => update('alertsRoleId', ids[0] ?? null)}
            />
          </Field>
          <Field
            label="Offline after failed polls"
            hint="1–10. Consecutive failures before the city is declared down (avoids flapping)."
          >
            <input
              type="number"
              min={1}
              max={10}
              className={inputClass}
              value={config.offlineAfterFailures}
              onChange={(e) => update('offlineAfterFailures', toInt(e.target.value, config.offlineAfterFailures))}
            />
          </Field>
          <Field label="Timezone" hint="IANA name the restart times are in, e.g. America/New_York.">
            <input
              className={inputClass}
              list="fivem-timezones"
              value={config.timezone}
              maxLength={64}
              onChange={(e) => update('timezone', e.target.value)}
            />
            <datalist id="fivem-timezones">
              {zones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </Field>
          <Field label="Daily restart times" hint="24h HH:MM, comma-separated. Up to 12, e.g. 06:00, 18:00.">
            <TokenListInput
              className={monoInputClass}
              value={config.restartTimes}
              placeholder="06:00, 18:00"
              maxItems={12}
              onChange={(list) => update('restartTimes', list)}
            />
          </Field>
          <Field label="Warn before restart (minutes)" hint="Up to 6 values, 1–120, e.g. 30, 15, 5.">
            <TokenListInput
              className={monoInputClass}
              value={config.restartWarnMinutes.map(String)}
              placeholder="30, 15, 5"
              maxItems={6}
              onChange={(list) =>
                update(
                  'restartWarnMinutes',
                  list.map((token) => Number(token)).filter((n) => Number.isInteger(n)),
                )
              }
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Whitelist"
        description="Only let members with certain Discord roles join the city."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-[var(--color-brand)]/25 bg-[var(--color-brand)]/[0.07] px-3 py-2.5 text-xs leading-relaxed text-white/65">
            The game server enforces this through the{' '}
            <code className="rounded bg-black/30 px-1 text-white/85">refx_whitelist</code> resource: on
            connect it asks the bot whether the player&apos;s linked Discord account holds one of the
            roles below. Install the resource on the server and give it the same{' '}
            <code className="rounded bg-black/30 px-1 text-white/85">FIVEM_API_KEY</code> the bot is
            configured with. Players need Discord running so FiveM can link their account.
          </div>
          <ToggleRow
            title="Enforce whitelist"
            description="Refuse connections from members without a whitelisted role."
            checked={config.whitelistEnabled}
            onChange={(next) => update('whitelistEnabled', next)}
          />
          <Field label="Whitelisted roles" hint="Members need at least one of these roles to connect.">
            <RoleSelect
              roles={roles}
              multiple
              selected={config.whitelistRoleIds}
              onChange={(ids) => update('whitelistRoleIds', ids)}
            />
          </Field>
          <Field label="Denied message" hint="Shown on the FiveM connect screen when a player is refused.">
            <textarea
              className={`${inputClass} min-h-[80px]`}
              value={config.whitelistDeniedMessage}
              maxLength={500}
              onChange={(e) => update('whitelistDeniedMessage', e.target.value)}
            />
          </Field>
          {config.whitelistEnabled && config.whitelistRoleIds.length === 0 && (
            <p className="text-xs text-[var(--color-warning)]">
              No roles selected: with the whitelist on, nobody will be able to connect.
            </p>
          )}
        </div>
      </SettingsSection>

      <div className="flex flex-col gap-2 pt-1">
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <SaveBar pending={pending} status={status} onSave={save} />
      </div>
    </div>
  );
}
