import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Crown, Dices, LayoutDashboard, ScrollText, Settings2 } from 'lucide-react';
import { prisma } from '@solari/database';
import { guardGuildAccess } from '../../../lib/auth-guards';
import { guildIconUrl } from '../../../lib/discord';
import { MODULE_META } from '../../../lib/modules';
import { NavLink } from '../../../components/nav-link';
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
  await guardGuildAccess(id);

  const [guild, flagRows] = await Promise.all([
    prisma.guild.findUnique({ where: { id } }),
    prisma.globalModuleFlag.findMany({ where: { enabled: false }, select: { module: true } }),
  ]);
  if (!guild) notFound();

  const globallyOff = new Set((flagRows as { module: string }[]).map((f) => f.module));
  const isPremium = guild.premiumTier === 'PREMIUM';
  const icon = guildIconUrl(id, guild.icon, 48);

  // Icons are rendered to elements here (server-side). NavLink is a client
  // component and React cannot serialize a component/function across that
  // boundary, so we must pass `<Icon />`, never `Icon`.
  const serverNav = [
    { href: `/servers/${id}`, label: 'Overview', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
    { href: `/servers/${id}/settings`, label: 'Settings', icon: <Settings2 className="h-4 w-4 shrink-0" /> },
    { href: `/servers/${id}/audit`, label: 'Audit log', icon: <ScrollText className="h-4 w-4 shrink-0" /> },
  ];
  // Module links derive from MODULE_META so the sidebar grows as config pages land.
  const moduleNav = MODULE_META.filter((m) => m.configSlug).map((m) => {
    const Icon = m.icon;
    return {
      href: `/servers/${id}/${m.configSlug}`,
      label: m.name,
      icon: <Icon className="h-4 w-4 shrink-0" />,
      locked: m.category === 'premium' && !isPremium,
      disabledGlobally: globallyOff.has(m.module),
    };
  });
  // Casino is a sub-surface of the (premium) Economy module — its games spend the
  // Economy currency — so it locks/disables in lockstep with Economy.
  moduleNav.push({
    href: `/servers/${id}/casino`,
    label: 'Casino',
    icon: <Dices className="h-4 w-4 shrink-0" />,
    locked: !isPremium,
    disabledGlobally: globallyOff.has('ECONOMY'),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/servers"
            className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
            aria-label="All servers"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          {icon ? (
            <img src={icon} alt="" className="h-11 w-11 rounded-2xl ring-1 ring-white/10" />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-sm font-semibold text-white/60 ring-1 ring-white/10">
              {(guild.name ?? '?').slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-semibold leading-tight text-white/90">
              {guild.name ?? id}
            </h1>
            <p className="text-xs text-white/40">
              {(guild.memberCount ?? 0).toLocaleString()} members
            </p>
          </div>
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

          {moduleNav.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <SectionLabel>Modules</SectionLabel>
              {moduleNav.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  locked={item.locked}
                  disabledGlobally={item.disabledGlobally}
                />
              ))}
            </div>
          )}
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
