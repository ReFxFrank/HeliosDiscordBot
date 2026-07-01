'use client';

import { useState, useTransition } from 'react';
import type { CasinoConfig, EconomyConfig } from '@solari/shared';
import { saveEconomyConfig } from '../lib/config-actions';
import { Switch } from './ui/switch';
import { Field, SaveBar, inputClass, type SaveStatus } from './ui/form';

const GAMES: {
  key: keyof Pick<CasinoConfig, 'blackjack' | 'roulette' | 'coinflip' | 'slots' | 'dice'>;
  label: string;
  desc: string;
}[] = [
  { key: 'blackjack', label: 'Blackjack', desc: 'Hit/Stand/Double vs. the dealer.' },
  { key: 'roulette', label: 'Roulette', desc: 'Bet a colour or range, spin the wheel.' },
  { key: 'coinflip', label: 'Coinflip', desc: 'Double-or-nothing heads/tails.' },
  { key: 'slots', label: 'Slots', desc: 'Three-reel slot machine.' },
  { key: 'dice', label: 'Dice', desc: 'Roll against the house — highest total wins.' },
];

function num(value: string, min: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

export function CasinoForm({ guildId, initial }: { guildId: string; initial: EconomyConfig }) {
  const [config, setConfig] = useState<EconomyConfig>(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pending, startTransition] = useTransition();
  const casino = config.casino;

  function patchCasino(partial: Partial<CasinoConfig>): void {
    setConfig((prev) => ({ ...prev, casino: { ...prev.casino, ...partial } }));
    setStatus('idle');
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveEconomyConfig(guildId, config);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-white/80">Games</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {GAMES.map((game) => (
            <div
              key={game.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm text-white/85">{game.label}</p>
                <p className="truncate text-xs text-white/40">{game.desc}</p>
              </div>
              <Switch
                checked={casino[game.key]}
                onChange={(next) => patchCasino({ [game.key]: next } as Partial<CasinoConfig>)}
                label={`Toggle ${game.label}`}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-white/80">Bet limits</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Minimum bet">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={casino.minBet}
              onChange={(e) => patchCasino({ minBet: num(e.target.value, 1, 10) })}
            />
          </Field>
          <Field label="Maximum bet">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={casino.maxBet}
              onChange={(e) => patchCasino({ maxBet: num(e.target.value, 1, 10_000) })}
            />
          </Field>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-white/80">Payouts</h3>
        <p className="mb-3 text-xs text-white/40">
          Multipliers are the <em>total</em> returned — bet × multiplier (so 2× is break-even + your
          bet back).
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Slots — 3 of a kind (×)">
            <input
              type="number"
              min={1}
              step={0.1}
              className={inputClass}
              value={casino.slotsTripleMultiplier}
              onChange={(e) => patchCasino({ slotsTripleMultiplier: num(e.target.value, 1, 3) })}
            />
          </Field>
          <Field label="Slots — pair (×)">
            <input
              type="number"
              min={0}
              step={0.1}
              className={inputClass}
              value={casino.slotsPairMultiplier}
              onChange={(e) => patchCasino({ slotsPairMultiplier: num(e.target.value, 0, 1.5) })}
            />
          </Field>
          <Field label="Blackjack — natural (×)" hint="Two-card 21. Standard 3:2 = 2.5.">
            <input
              type="number"
              min={1}
              step={0.1}
              className={inputClass}
              value={casino.blackjackMultiplier}
              onChange={(e) => patchCasino({ blackjackMultiplier: num(e.target.value, 1, 2.5) })}
            />
          </Field>
        </div>
      </div>

      <SaveBar pending={pending} status={status} onSave={save} />
    </div>
  );
}
