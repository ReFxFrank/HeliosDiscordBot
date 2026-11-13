'use client';

import { TWITCH_DEFAULTS, type TwitchChatConfig, type TwitchDefaultKey } from '@refx/shared';
import { Switch } from '../ui/switch';
import { Badge, NumberInput, PermissionSelect, useSection } from './ui';

const GROUPS = ['Information', 'Users', 'Fun', 'Songs', 'Management'] as const;

export function DefaultsEditor({
  guildId,
  config,
  broadcasterConnected,
}: {
  guildId: string;
  config: TwitchChatConfig;
  broadcasterConnected: boolean;
}) {
  const { value, update, bar } = useSection(guildId, 'defaults', config.defaults);
  const patch = (
    key: TwitchDefaultKey,
    change: Partial<TwitchChatConfig['defaults'][TwitchDefaultKey]>,
  ) => update((prev) => ({ ...prev, [key]: { ...prev[key], ...change } }));

  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((group) => (
        <div key={group} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">{group}</h3>
          {TWITCH_DEFAULTS.filter((doc) => doc.group === group).map((doc) => {
            const setting = value[doc.key];
            return (
              <div
                key={doc.key}
                className="grid items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 md:grid-cols-[1fr_170px_110px_auto]"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 font-mono text-sm text-white/90">
                    !{doc.name}
                    {'usage' in doc && <span className="text-xs text-white/40">{doc.usage}</span>}
                    {'aliases' in doc && <Badge>also !{doc.aliases.join(', !')}</Badge>}
                    {'broadcaster' in doc && (
                      <Badge tone={broadcasterConnected ? 'purple' : 'warn'}>
                        {broadcasterConnected ? 'broadcaster connected' : 'needs broadcaster'}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-white/50">{doc.desc}</p>
                </div>
                <PermissionSelect
                  value={setting.permission}
                  onChange={(permission) => patch(doc.key, { permission })}
                />
                <label className="flex items-center gap-1.5 text-xs text-white/50">
                  <NumberInput
                    value={setting.cooldown}
                    min={0}
                    max={3600}
                    onChange={(cooldown) => patch(doc.key, { cooldown })}
                  />
                  s
                </label>
                <Switch
                  checked={setting.enabled}
                  onChange={(enabled) => patch(doc.key, { enabled })}
                  label={`!${doc.name}`}
                />
              </div>
            );
          })}
        </div>
      ))}
      {bar}
    </div>
  );
}
