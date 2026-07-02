import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { prisma } from '@solari/database';
import { BRAND } from '@solari/shared';
import { auth } from '../../auth';
import { getManageableGuilds } from '../../lib/auth-guards';
import { guildIconUrl, type ManageableGuild } from '../../lib/discord';
import { botInviteUrl } from '../../lib/invite';
import { LoginButton } from '../../components/auth-buttons';
import { GlassCard } from '../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function ServersPage({
  searchParams,
}: {
  searchParams: Promise<{ stale?: string }>;
}) {
  const { stale } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-2xl font-semibold">Sign in to continue</h1>
        <p className="text-sm text-white/60">Log in with Discord to manage your servers.</p>
        <LoginButton />
      </main>
    );
  }

  const guilds = getManageableGuilds(session);
  const ids = guilds.map((g) => g.id);
  const present = ids.length
    ? await prisma.guild.findMany({
        // leftAt set = the bot was kicked; the row is retained for a re-invite
        // but the server belongs under "Add Solari", not "Configure".
        where: { id: { in: ids }, leftAt: null },
        select: { id: true, memberCount: true },
      })
    : [];
  const memberCounts = new Map(present.map((p) => [p.id, p.memberCount]));
  const clientId = process.env.DISCORD_CLIENT_ID ?? '';

  const configurable = guilds.filter((g) => memberCounts.has(g.id));
  const invitable = guilds.filter((g) => !memberCounts.has(g.id));

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your servers</h1>
          <p className="mt-1 text-sm text-white/55">Servers where you have Manage Server.</p>
        </div>
        <Link href="/account" className="text-sm text-white/55 hover:text-white/80">
          {session.user.name ?? 'Account'}
        </Link>
      </div>

      {stale && (
        <GlassCard className="mb-6 border-[var(--color-warning)]/30 p-4">
          <p className="text-sm text-[var(--color-warning)]">
            We couldn&rsquo;t verify your servers with Discord just now — that click didn&rsquo;t go
            through. Try again in a few seconds; if it keeps happening, sign out and back in.
          </p>
        </GlassCard>
      )}

      {guilds.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="text-white/70">No servers found where you can manage settings.</p>
          <p className="mt-1 text-sm text-white/40">
            You need the Manage Server permission on a server to configure {BRAND.name} there.
          </p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-10">
          {configurable.length > 0 && (
            <Section title="Configure">
              {configurable.map((g) => (
                <GuildRow
                  key={g.id}
                  guild={g}
                  memberCount={memberCounts.get(g.id) ?? null}
                  href={`/servers/${g.id}`}
                  cta="Configure"
                />
              ))}
            </Section>
          )}
          {invitable.length > 0 && (
            <Section title={`Add ${BRAND.name}`}>
              {invitable.map((g) => (
                <GuildRow
                  key={g.id}
                  guild={g}
                  memberCount={null}
                  href={botInviteUrl(clientId)}
                  cta="Invite"
                  external
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function GuildRow({
  guild,
  memberCount,
  href,
  cta,
  external,
}: {
  guild: ManageableGuild;
  memberCount: number | null;
  href: string;
  cta: string;
  external?: boolean;
}) {
  const icon = guildIconUrl(guild.id, guild.icon);
  const inner = (
    <GlassCard className="flex items-center gap-3 p-3 transition-colors hover:bg-white/[0.06]">
      {icon ? (
        <img src={icon} alt="" className="h-10 w-10 rounded-xl" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-sm font-semibold text-white/60">
          {guild.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white/90">{guild.name}</p>
        {memberCount !== null && (
          <p className="font-mono text-xs text-white/40">{memberCount.toLocaleString()} members</p>
        )}
      </div>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-brand-bright)]">
        {cta === 'Invite' ? <Plus className="h-4 w-4" /> : null}
        {cta}
        {cta !== 'Invite' && <ArrowRight className="h-4 w-4" />}
      </span>
    </GlassCard>
  );

  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <Link href={href}>{inner}</Link>
  );
}
