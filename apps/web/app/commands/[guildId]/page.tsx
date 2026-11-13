import { notFound } from 'next/navigation';
import { prisma } from '@refx/database';
import {
  BRAND,
  TWITCH_DEFAULTS,
  TWITCH_PERMISSION_LABELS,
  twitchChatConfigSchema,
} from '@refx/shared';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Chat commands' };

/** Public list of a channel's Twitch chat commands (what !commands links to). */
export default async function PublicCommandsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  if (!/^\d{17,20}$/.test(guildId)) notFound();
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'TWITCH_CHAT' } },
    select: { config: true, enabled: true },
  });
  if (!row?.enabled) notFound();
  const config = twitchChatConfigSchema.parse(row.config ?? {});
  if (!config.channel) notFound();
  const commands = config.commands
    .filter((c) => c.enabled && !c.hidden)
    .sort((a, b) => a.name.localeCompare(b.name));
  const defaults = TWITCH_DEFAULTS.filter((d) => config.defaults[d.key].enabled);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <h1 className="text-xl font-semibold text-white/90">{config.channel}’s chat commands</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">Commands</h2>
        {commands.length === 0 && <p className="text-white/50">No custom commands yet.</p>}
        {commands.map((command) => (
          <div
            key={command.id}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
          >
            <p className="font-mono text-sm text-white/90">
              !{command.name}
              {command.aliases.length > 0 && (
                <span className="text-white/40"> (also !{command.aliases.join(', !')})</span>
              )}
              {command.permission !== 'everyone' && (
                <span className="ml-2 text-xs text-white/45">
                  {TWITCH_PERMISSION_LABELS[command.permission]}
                </span>
              )}
            </p>
            <p className="text-sm text-white/60">{command.response}</p>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">Built-in</h2>
        {defaults.map((doc) => (
          <div
            key={doc.key}
            className="flex flex-wrap items-baseline gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
          >
            <span className="font-mono text-sm text-white/85">
              !{doc.name} {'usage' in doc ? doc.usage : ''}
            </span>
            <span className="text-sm text-white/55">{doc.desc}</span>
            {config.defaults[doc.key].permission !== 'everyone' && (
              <span className="text-xs text-white/40">
                {TWITCH_PERMISSION_LABELS[config.defaults[doc.key].permission]}
              </span>
            )}
          </div>
        ))}
      </section>
      <p className="text-center text-xs text-white/30">{BRAND.name}</p>
    </main>
  );
}
