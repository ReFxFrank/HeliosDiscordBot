'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  TWITCH_COMMANDS_MAX,
  TWITCH_PERMISSION_LABELS,
  twitchChatConfigProblems,
  type TwitchChatConfig,
  type TwitchCommand,
} from '@refx/shared';
import { Field, inputClass, monoInputClass } from '../ui/form';
import { TokenListInput } from '../ui/token-list-input';
import {
  Badge,
  ItemCard,
  NumberInput,
  PermissionSelect,
  ResponseTypeSelect,
  TemplateInput,
  ToggleRow,
  newId,
  useSection,
} from './ui';

function blankCommand(): TwitchCommand {
  return {
    id: newId('cmd'),
    name: '',
    aliases: [],
    response: '',
    permission: 'everyone',
    responseType: 'say',
    cooldown: 5,
    userCooldown: 15,
    whenLive: true,
    whenOffline: true,
    hidden: false,
    whisperOnCooldown: false,
    expiresAt: null,
    expireAction: 'disable',
    enabled: true,
    createdBy: null,
  };
}

/** ISO ↔ the value a datetime-local input wants (local time). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function CommandsEditor({ guildId, config }: { guildId: string; config: TwitchChatConfig }) {
  const {
    value: commands,
    update,
    bar,
  } = useSection(guildId, 'commands', config.commands, (next) => {
    const problems = twitchChatConfigProblems({ ...config, commands: next });
    return problems[0] ?? null;
  });
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const patch = (id: string, change: Partial<TwitchCommand>) =>
    update((list) => list.map((c) => (c.id === id ? { ...c, ...change } : c)));

  const shown = commands.filter((c) => {
    const q = search.trim().toLowerCase().replace(/^!/, '');
    return (
      !q ||
      c.name.includes(q) ||
      c.aliases.some((a) => a.includes(q)) ||
      c.response.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="Search commands"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-white/40">
          {commands.length}/{TWITCH_COMMANDS_MAX}
        </span>
        {commands.length < TWITCH_COMMANDS_MAX && (
          <button
            type="button"
            onClick={() => {
              const command = blankCommand();
              update((list) => [command, ...list]);
              setOpen(command.id);
              setSearch('');
            }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" /> New command
          </button>
        )}
      </div>

      {commands.length === 0 && (
        <p className="text-sm text-white/45">
          No commands yet. Make !discord, !socials, !schedule… here, or with !addcmd in chat.
        </p>
      )}

      {shown.map((command) => (
        <ItemCard
          key={command.id}
          title={`!${command.name || '…'}`}
          subtitle={command.response}
          enabled={command.enabled}
          open={open === command.id}
          onToggle={() => setOpen(open === command.id ? null : command.id)}
          onEnabled={(enabled) => patch(command.id, { enabled })}
          onRemove={() => update((list) => list.filter((c) => c.id !== command.id))}
          badge={
            <>
              {command.permission !== 'everyone' && (
                <Badge>{TWITCH_PERMISSION_LABELS[command.permission]}</Badge>
              )}
              {command.hidden && <Badge>hidden</Badge>}
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Command" hint="What chatters type, without the !">
              <input
                className={monoInputClass}
                value={command.name}
                maxLength={31}
                placeholder="discord"
                onChange={(e) =>
                  patch(command.id, {
                    name: e.target.value.replace(/\s/g, '').replace(/^!+/, '').toLowerCase(),
                  })
                }
              />
            </Field>
            <Field label="Aliases" hint="Other names for it, comma-separated.">
              <TokenListInput
                value={command.aliases}
                onChange={(aliases) => patch(command.id, { aliases })}
                placeholder="dc, disc"
                maxItems={10}
              />
            </Field>
          </div>
          <Field label="Response">
            <TemplateInput
              value={command.response}
              onChange={(response) => patch(command.id, { response })}
              placeholder="Join the Discord: https://discord.gg/…"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Who can use it">
              <PermissionSelect
                value={command.permission}
                onChange={(permission) => patch(command.id, { permission })}
              />
            </Field>
            <Field label="Response type">
              <ResponseTypeSelect
                value={command.responseType}
                onChange={(responseType) => patch(command.id, { responseType })}
              />
            </Field>
            <Field label="Cooldown (s)" hint="Whole chat. Mods skip it.">
              <NumberInput
                value={command.cooldown}
                min={0}
                max={86_400}
                onChange={(cooldown) => patch(command.id, { cooldown })}
              />
            </Field>
            <Field label="User cooldown (s)">
              <NumberInput
                value={command.userCooldown}
                min={0}
                max={86_400}
                onChange={(userCooldown) => patch(command.id, { userCooldown })}
              />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ToggleRow
              title="Works while live"
              checked={command.whenLive}
              onChange={(whenLive) => patch(command.id, { whenLive })}
            />
            <ToggleRow
              title="Works while offline"
              checked={command.whenOffline}
              onChange={(whenOffline) => patch(command.id, { whenOffline })}
            />
            <ToggleRow
              title="Hidden from !commands"
              description="Still works when typed."
              checked={command.hidden}
              onChange={(hidden) => patch(command.id, { hidden })}
            />
            <ToggleRow
              title="Whisper during cooldown"
              description="Someone who hits the cooldown gets it privately."
              checked={command.whisperOnCooldown}
              onChange={(whisperOnCooldown) => patch(command.id, { whisperOnCooldown })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Expires" hint="Optional. Blank never expires.">
              <input
                type="datetime-local"
                className={inputClass}
                value={toLocalInput(command.expiresAt)}
                onChange={(e) =>
                  patch(command.id, {
                    expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
              />
            </Field>
            <Field label="When it expires">
              <select
                className={inputClass}
                value={command.expireAction}
                onChange={(e) =>
                  patch(command.id, {
                    expireAction: e.target.value as TwitchCommand['expireAction'],
                  })
                }
              >
                <option value="disable">Turn it off</option>
                <option value="delete">Delete it</option>
              </select>
            </Field>
          </div>
          {command.createdBy && (
            <p className="text-xs text-white/40">Made in chat by {command.createdBy}.</p>
          )}
        </ItemCard>
      ))}
      {bar}
    </div>
  );
}
