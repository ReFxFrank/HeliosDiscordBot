import { prisma } from '@refx/database';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getApplicationCommands } from '../../../../lib/discord-commands';
import { CommandToggles } from '../../../../components/command-toggles';

export const dynamic = 'force-dynamic';

export default async function SlashCommandsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [commands, guild] = await Promise.all([
    getApplicationCommands(),
    prisma.guild.findUnique({ where: { id }, select: { disabledCommands: true } }),
  ]);
  const disabled = guild?.disabledCommands ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Slash Commands</h2>
        <p className="text-sm text-white/50">
          Turn individual commands on or off for this server. A disabled command refuses everyone —
          moderators included — within ~1s of the change.
        </p>
      </div>
      {commands === null ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-white/40">
          Couldn&apos;t reach Discord to load the command list — check that the bot token is
          configured, then reload.
        </div>
      ) : commands.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-white/40">
          No commands are registered yet — run the deploy step (
          <code className="text-white/60">pnpm deploy:commands</code>) and reload.
        </div>
      ) : (
        <CommandToggles guildId={id} commands={commands} initialDisabled={disabled} />
      )}
    </div>
  );
}
