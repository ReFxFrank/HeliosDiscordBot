'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Dices, Plus, Trash2 } from 'lucide-react';
import type { EconomyConfig } from '@solari/shared';
import type { RoleOption } from '../lib/discord-guild';
import { saveEconomyConfig } from '../lib/config-actions';
import { Switch } from './ui/switch';
import { RoleSelect } from './ui/entity-select';
import { SettingsSection } from './ui/settings-section';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';

const clamp = (value: string, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  return Number.isNaN(n) ? fallback : Math.max(min, Math.min(max, Math.round(n)));
};

/** Browser-only stable id for new shop rows. */
const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export function EconomyForm({
  guildId,
  initial,
  roles,
}: {
  guildId: string;
  initial: EconomyConfig;
  roles: RoleOption[];
}) {
  const [config, setConfig] = useState<EconomyConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();

  function update<K extends keyof EconomyConfig>(key: K, value: EconomyConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  }

  // ── Income roles ──
  function addIncomeRole(): void {
    update('incomeRoles', [...config.incomeRoles, { roleId: '', dailyBonus: 100 }]);
  }
  function updateIncomeRole(index: number, partial: Partial<EconomyConfig['incomeRoles'][number]>): void {
    update(
      'incomeRoles',
      config.incomeRoles.map((r, i) => (i === index ? { ...r, ...partial } : r)),
    );
  }
  function removeIncomeRole(index: number): void {
    update('incomeRoles', config.incomeRoles.filter((_, i) => i !== index));
  }

  // ── Shop items ──
  function addShopItem(): void {
    update('shopItems', [
      ...config.shopItems,
      { id: newId(), label: 'New item', description: '', price: 100, roleId: null },
    ]);
  }
  function updateShopItem(index: number, partial: Partial<EconomyConfig['shopItems'][number]>): void {
    update(
      'shopItems',
      config.shopItems.map((item, i) => (i === index ? { ...item, ...partial } : item)),
    );
  }
  function removeShopItem(index: number): void {
    update('shopItems', config.shopItems.filter((_, i) => i !== index));
  }

  function save(): void {
    startTransition(async () => {
      // Keep workMax ≥ workMin, and drop income-role rows with no role selected.
      const payload: EconomyConfig = {
        ...config,
        workMax: Math.max(config.workMin, config.workMax),
        incomeRoles: config.incomeRoles.filter((r) => r.roleId),
      };
      const result = await saveEconomyConfig(guildId, payload);
      if (result.ok) setConfig(payload);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Currency"
        description="The name, symbol, and starting balance for your server's economy."
      >
        <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
          <Field label="Currency name" hint="Plural, e.g. “coins”.">
            <input
              className={inputClass}
              maxLength={32}
              value={config.currencyName}
              onChange={(e) => update('currencyName', e.target.value)}
            />
          </Field>
          <Field label="Currency symbol" hint="Emoji or short symbol.">
            <input
              className={inputClass}
              maxLength={16}
              value={config.currencySymbol}
              onChange={(e) => update('currencySymbol', e.target.value)}
            />
          </Field>
          <Field label="Starting balance" hint="New members start with this.">
            <input
              type="number"
              min={0}
              max={1_000_000}
              className={inputClass}
              value={config.startingBalance}
              onChange={(e) => update('startingBalance', clamp(e.target.value, 0, 1_000_000, 0))}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Income"
        description="How members earn currency with /daily and /work, plus per-role daily bonuses."
      >
        <div className="flex flex-col gap-5">
          <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
            <Field label="Daily amount" hint="Base payout of /daily.">
              <input
                type="number"
                min={0}
                max={1_000_000}
                className={inputClass}
                value={config.dailyAmount}
                onChange={(e) => update('dailyAmount', clamp(e.target.value, 0, 1_000_000, 0))}
              />
            </Field>
            <Field
              label="Vote reward"
              hint="Payout for a top.gg vote via /vote (doubled on weekends). 0 disables."
            >
              <input
                type="number"
                min={0}
                max={1_000_000}
                className={inputClass}
                value={config.voteReward}
                onChange={(e) => update('voteReward', clamp(e.target.value, 0, 1_000_000, 250))}
              />
            </Field>
            <Field label="Work cooldown (seconds)" hint="Time between /work uses (0–604800).">
              <input
                type="number"
                min={0}
                max={604_800}
                className={inputClass}
                value={config.workCooldownSeconds}
                onChange={(e) =>
                  update('workCooldownSeconds', clamp(e.target.value, 0, 604_800, 3600))
                }
              />
            </Field>
            <Field label="Work minimum" hint="Lowest /work payout.">
              <input
                type="number"
                min={0}
                max={1_000_000}
                className={inputClass}
                value={config.workMin}
                onChange={(e) => update('workMin', clamp(e.target.value, 0, 1_000_000, 50))}
              />
            </Field>
            <Field label="Work maximum" hint="Highest /work payout (kept ≥ minimum).">
              <input
                type="number"
                min={0}
                max={1_000_000}
                className={inputClass}
                value={config.workMax}
                onChange={(e) => update('workMax', clamp(e.target.value, 0, 1_000_000, 250))}
              />
            </Field>
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="text-sm font-medium text-white/80">Income roles</p>
            <p className="mb-3 text-xs text-white/50">
              Members with these roles get a bonus added to their /daily (bonuses stack).
            </p>
            <div className="flex flex-col gap-3">
              {config.incomeRoles.map((row, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3"
                >
                  <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                    <span className="text-xs font-medium text-white/60">Role</span>
                    <RoleSelect
                      roles={roles}
                      selected={row.roleId ? [row.roleId] : []}
                      onChange={(ids) => updateIncomeRole(index, { roleId: ids[0] ?? '' })}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-white/60">Daily bonus</span>
                    <input
                      type="number"
                      min={0}
                      max={1_000_000}
                      className={`${inputClass} w-32`}
                      value={row.dailyBonus}
                      onChange={(e) =>
                        updateIncomeRole(index, {
                          dailyBonus: clamp(e.target.value, 0, 1_000_000, 0),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeIncomeRole(index)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-white/60 transition-colors hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              ))}
              {config.incomeRoles.length < 25 && (
                <button
                  type="button"
                  onClick={addIncomeRole}
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-white/70 transition-colors hover:border-[var(--color-brand)]/50 hover:text-white/90"
                >
                  <Plus className="h-4 w-4" /> Add income role
                </button>
              )}
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Rob"
        description="Let members risk stealing from each other's wallets with /rob."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div>
              <p className="text-sm text-white/90">Enable /rob</p>
              <p className="text-xs text-white/50">Members can attempt to steal from others.</p>
            </div>
            <Switch
              checked={config.robEnabled}
              onChange={(next) => update('robEnabled', next)}
              label="Enable rob"
            />
          </div>
          {config.robEnabled && (
            <div className="grid max-w-2xl gap-5 sm:grid-cols-3">
              <Field label="Success rate (%)" hint="Chance a rob succeeds.">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputClass}
                  value={config.robSuccessRate}
                  onChange={(e) => update('robSuccessRate', clamp(e.target.value, 0, 100, 50))}
                />
              </Field>
              <Field label="Cooldown (seconds)" hint="Time between rob attempts.">
                <input
                  type="number"
                  min={0}
                  max={604_800}
                  className={inputClass}
                  value={config.robCooldownSeconds}
                  onChange={(e) =>
                    update('robCooldownSeconds', clamp(e.target.value, 0, 604_800, 3600))
                  }
                />
              </Field>
              <Field label="Fine (%)" hint="Paid to the victim on a failed rob.">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputClass}
                  value={config.robFinePercent}
                  onChange={(e) => update('robFinePercent', clamp(e.target.value, 0, 100, 10))}
                />
              </Field>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Shop"
        description="Sell roles for currency. Members buy with /shop and /buy."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-3">
          {config.shopItems.length === 0 && (
            <p className="text-sm text-white/50">No items yet. Add one to open your shop.</p>
          )}
          {config.shopItems.map((item, index) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <Field label="Item name">
                  <input
                    className={inputClass}
                    maxLength={64}
                    value={item.label}
                    onChange={(e) => updateShopItem(index, { label: e.target.value })}
                  />
                </Field>
                <Field label="Price">
                  <input
                    type="number"
                    min={0}
                    max={1_000_000_000}
                    className={inputClass}
                    value={item.price}
                    onChange={(e) =>
                      updateShopItem(index, { price: clamp(e.target.value, 0, 1_000_000_000, 100) })
                    }
                  />
                </Field>
              </div>
              <Field label="Grants role" hint="The role given on purchase.">
                <RoleSelect
                  roles={roles}
                  placeholder="None"
                  selected={item.roleId ? [item.roleId] : []}
                  onChange={(ids) => updateShopItem(index, { roleId: ids[0] ?? null })}
                />
              </Field>
              <Field label="Description" hint="Optional — shown in /shop.">
                <input
                  className={inputClass}
                  maxLength={200}
                  value={item.description}
                  onChange={(e) => updateShopItem(index, { description: e.target.value })}
                />
              </Field>
              <button
                type="button"
                onClick={() => removeShopItem(index)}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-white/60 transition-colors hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)]"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove item
              </button>
            </div>
          ))}
          {config.shopItems.length < 50 && (
            <button
              type="button"
              onClick={addShopItem}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-white/70 transition-colors hover:border-[var(--color-brand)]/50 hover:text-white/90"
            >
              <Plus className="h-4 w-4" /> Add shop item
            </button>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Gambling & Casino"
        description="The global maximum wager, plus per-game casino settings."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-5">
          <div className="max-w-xs">
            <Field label="Max bet" hint="Largest wager allowed in gambling commands.">
              <input
                type="number"
                min={1}
                max={100_000_000}
                className={inputClass}
                value={config.maxBet}
                onChange={(e) => update('maxBet', clamp(e.target.value, 1, 100_000_000, 10_000))}
              />
            </Field>
          </div>
          <Link
            href={`/servers/${guildId}/casino`}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/85 transition-colors hover:border-[var(--color-brand)]/40 hover:bg-white/[0.06]"
          >
            <Dices className="h-4 w-4 text-[var(--color-brand)]" /> Configure casino games →
          </Link>
        </div>
      </SettingsSection>

      <div className="pt-1">
        <SaveBar pending={pending} status={status} onSave={save} />
      </div>
    </div>
  );
}
