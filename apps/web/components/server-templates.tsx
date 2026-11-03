'use client';

import { useState, useTransition } from 'react';
import { Hash, Volume2, Shield, Sparkles } from 'lucide-react';
import { templateChannelCount, type ServerTemplate } from '@refx/shared';
import { applyServerTemplateAction } from '../lib/template-actions';

const prettyModule = (module: string): string =>
  module
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');

type CardState = { status: 'idle' | 'armed' | 'done' | 'error'; message?: string };

export function ServerTemplates({
  guildId,
  templates,
}: {
  guildId: string;
  templates: ServerTemplate[];
}) {
  const [pending, startTransition] = useTransition();
  const [states, setStates] = useState<Record<string, CardState>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const setState = (id: string, state: CardState): void =>
    setStates((prev) => ({ ...prev, [id]: state }));

  const apply = (id: string): void => {
    setBusyId(id);
    startTransition(async () => {
      const result = await applyServerTemplateAction(guildId, id);
      setBusyId(null);
      setState(
        id,
        result.ok
          ? { status: 'done', message: 'Building in your server — check Discord in a moment.' }
          : { status: 'error', message: result.error ?? 'Something went wrong.' },
      );
    });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {templates.map((template) => {
        const categories = template.categories.length;
        const channels = templateChannelCount(template) - categories;
        const state = states[template.id] ?? { status: 'idle' };
        const isBusy = pending && busyId === template.id;

        return (
          <div
            key={template.id}
            className="glass flex flex-col gap-3 rounded-2xl p-5"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden>
                {template.emoji}
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-white">{template.name}</h3>
                <p className="mt-0.5 text-sm text-white/70">{template.description}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
              <span className="inline-flex items-center gap-1">
                <Hash className="h-3.5 w-3.5" /> {channels} channels
              </span>
              <span className="inline-flex items-center gap-1">
                <Volume2 className="h-3.5 w-3.5" /> {categories} categories
              </span>
              <span className="inline-flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" /> {template.roles.length} roles
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {template.modules.map((module) => (
                <span
                  key={module}
                  className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-white/70"
                >
                  {prettyModule(module)}
                </span>
              ))}
            </div>

            <div className="mt-auto flex items-center gap-3 pt-1">
              {state.status === 'armed' ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => apply(template.id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-brand-strong)] px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" /> {isBusy ? 'Building…' : 'Confirm — build it'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isBusy || state.status === 'done'}
                  onClick={() => setState(template.id, { status: 'armed' })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/[0.06] disabled:opacity-60"
                >
                  Apply template
                </button>
              )}
              {state.status === 'armed' && (
                <button
                  type="button"
                  onClick={() => setState(template.id, { status: 'idle' })}
                  className="text-xs text-white/50 transition-colors hover:text-white/80"
                >
                  Cancel
                </button>
              )}
              {state.message && (
                <span
                  className={`text-xs ${state.status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}
                >
                  {state.message}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
