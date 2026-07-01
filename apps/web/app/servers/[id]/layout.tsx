import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bot, Crown, Dices, LayoutDashboard, ScrollText, Settings2 } from 'lucide-react';
import { prisma } from '@solari/database';
import { guardGuildAccess } from '../../../lib/auth-guards';
import { groupedModuleMeta } from '../../../lib/modules';
import { NavLink } from '../../../components/nav-link';
import { ServerSwitcher } from '../../../components/server-switcher';
import { SignOutButton } from '../../../components/auth-buttons';

export const dynamic = 'force-dynamic';

export default async function GuildLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { guilds } = await guardGuildAccess(id);

  const [guild, flagRows] = await Promise.all([
    prisma.guild.findUnique({ where: { id } }),
    prisma.globalModuleFlag.findMany({ where: { enabled: false }, select: { module: true } }),
  ]);
  if (!guild) notFound();

  // The DB `Guild.icon`/`name` can be stale (only refreshed on the bot's guild
  // sync). The session guild list is fetched live from Discord on each request,
  // so prefer its icon hash + name and fall back to the DB row.
  const sessionGuild = guilds.find((g) => g.id === id);
  const currentName = sessionGuild?.name ?? guild.name ?? id;
  const currentIcon = sessionGuild?.icon ?? guild.icon ?? null;

  const globallyOff = new Set((flagRows as { module: string }[]).map((f) => f.module));
  const isPremium = guild.premiumTier === 'PREMIUM';

  // Icons are rendered to elements here (server-side). NavLink is a client
  // component and React cannot serialize a component/function across that
  // boundary, so we must pass `<Icon />`, never `Icon`.
  const serverNav = [
    { href: `/servers/${id}`, label: 'Overview', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
    { href: `/servers/${id}/settings`, label: 'Settings', icon: <Settings2 className="h-4 w-4 shrink-0" /> },
    { href: `/servers/${id}/audit`, label: 'Audit log', icon: <ScrollText className="h-4 w-4 shrink-0" /> },
  ];

  // Modules are grouped MEE6-style: one sidebar section per group, each listing
  // its config-page modules. Casino/Bot Personalizer are manual sub-surfaces
  // appended to their owning group (Games & Fun / Server Management).
  const moduleGroups = groupedModuleMeta();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ServerSwitcher
            currentId={id}
            current={{ name: currentName, icon: currentIcon }}
            guilds={guilds}
          />
          {isPremium ? (
            <span className="ml-1 hidden items-center gap-1 rounded-full bg-[var(--color-premium)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--color-premium)] sm:inline-flex">
              <Crown className="h-3.5 w-3.5" /> Premium
            </span>
          ) : (
            <Link
              href={`/servers/${id}/premium`}
              className="ml-1 hidden items-center gap-1 rounded-full border border-[var(--color-premium)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--color-premium)] transition-colors hover:bg-[var(--color-premium)]/10 sm:inline-flex"
            >
              <Crown className="h-3.5 w-3.5" /> Upgrade
            </Link>
          )}
        </div>
        <SignOutButton />
      </div>

      <div className="grid gap-6 md:grid-cols-[210px_1fr]">
        {/* Sidebar */}
        <nav className="flex flex-col gap-4 md:sticky md:top-6 md:self-start">
          <div className="flex flex-col gap-0.5">
            <SectionLabel>Server</SectionLabel>
            {serverNav.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
            ))}
            <NavLink href={`/servers/${id}/premium`} label="Premium" premium />
          </div>

          {moduleGroups.map(({ group, modules }) => (
            <div key={group} className="flex flex-col gap-0.5">
              <SectionLabel>{group}</SectionLabel>
              {modules.map((m) => {
                const Icon = m.icon;
                return (
                  <NavLink
                    key={m.module}
                    href={`/servers/${id}/${m.configSlug}`}
                    label={m.name}
                    icon={<Icon className="h-4 w-4 shrink-0" />}
                    locked={m.category === 'premium' && !isPremium}
                    disabledGlobally={globallyOff.has(m.module)}
                  />
                );
              })}
              {/* Casino is a sub-surface of the (premium) Economy module — its games
                  spend the Economy currency — so it locks/disables in lockstep. */}
              {group === 'Games & Fun' && (
                <NavLink
                  href={`/servers/${id}/casino`}
                  label="Casino"
                  icon={<Dices className="h-4 w-4 shrink-0" />}
                  locked={!isPremium}
                  disabledGlobally={globallyOff.has('ECONOMY')}
                />
              )}
              {/* Bot Personalizer is a premium-only surface with no global module flag. */}
              {group === 'Server Management' && (
                <NavLink
                  href={`/servers/${id}/personalizer`}
                  label="Bot Personalizer"
                  icon={<Bot className="h-4 w-4 shrink-0" />}
                  locked={!isPremium}
                  disabledGlobally={false}
                />
              )}
            </div>
          ))}
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">
      {children}
    </p>
  );
}
