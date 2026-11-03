import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { BarChart3, Hash, LayoutDashboard, PanelTop, Settings2, SquareSlash, Wand2 } from 'lucide-react';
import { prisma } from '@refx/database';
import { guardGuildAccess } from '../../../lib/auth-guards';
import { groupedModuleMeta, moduleBySlug } from '../../../lib/modules';
import { NavLink } from '../../../components/nav-link';
import { MobileSidebar } from '../../../components/mobile-sidebar';
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

  const [guild, flagRows, installedRows] = await Promise.all([
    prisma.guild.findUnique({ where: { id } }),
    prisma.globalModuleFlag.findMany({ where: { enabled: false }, select: { module: true } }),
    // Which of the user's manageable guilds actually have the bot — the
    // switcher must only offer those (a bot-less guild would just 404 here).
    prisma.guild.findMany({
      where: { id: { in: guilds.map((g) => g.id) }, leftAt: null },
      select: { id: true },
    }),
  ]);
  // No row, or the bot was kicked (row retained for re-invite) → not installed.
  if (!guild || guild.leftAt) notFound();

  const installed = new Set(installedRows.map((row) => row.id));
  const switchableGuilds = guilds.filter((g) => installed.has(g.id));

  // The DB `Guild.icon`/`name` can be stale (only refreshed on the bot's guild
  // sync). The session guild list is fetched live from Discord on each request,
  // so prefer its icon hash + name and fall back to the DB row.
  const sessionGuild = guilds.find((g) => g.id === id);
  const currentName = sessionGuild?.name ?? guild.name ?? id;
  const currentIcon = sessionGuild?.icon ?? guild.icon ?? null;

  const globallyOff = new Set((flagRows as { module: string }[]).map((f) => f.module));

  // Hard-block direct navigation to a config page whose module the owner has
  // globally disabled — slug-based, so it covers every current and future
  // module automatically.
  const pathname = (await headers()).get('x-pathname') ?? '';
  const slug = pathname.split('/')[3];
  if (slug) {
    const slugModule = moduleBySlug(slug);
    if (slugModule && globallyOff.has(slugModule)) notFound();
  }

  // Icons are rendered to elements here (server-side). NavLink is a client
  // component and React cannot serialize a component/function across that
  // boundary, so we must pass `<Icon />`, never `Icon`.
  const serverNav = [
    { href: `/servers/${id}`, label: 'Overview', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
    { href: `/servers/${id}/setup`, label: 'Server Setup', icon: <Wand2 className="h-4 w-4 shrink-0" /> },
    { href: `/servers/${id}/insights`, label: 'Insights', icon: <BarChart3 className="h-4 w-4 shrink-0" /> },
    { href: `/servers/${id}/settings`, label: 'Settings', icon: <Settings2 className="h-4 w-4 shrink-0" /> },
    { href: `/servers/${id}/slash-commands`, label: 'Slash Commands', icon: <SquareSlash className="h-4 w-4 shrink-0" /> },
    { href: `/servers/${id}/channels`, label: 'Channels', icon: <Hash className="h-4 w-4 shrink-0" /> },
    { href: `/servers/${id}/embeds`, label: 'Embeds', icon: <PanelTop className="h-4 w-4 shrink-0" /> },
  ];

  // Modules are grouped MEE6-style: one sidebar section per group, each listing
  // its config-page modules.
  const moduleGroups = groupedModuleMeta();
  const cityGroups = moduleGroups.filter((entry) => entry.group === 'ReFx City');
  const otherGroups = moduleGroups.filter((entry) => entry.group !== 'ReFx City');

  const renderGroup = ({ group, modules }: (typeof moduleGroups)[number]) => {
    // Globally-disabled modules are hidden entirely (not just dimmed), so
    // a user never sees or reaches a feature the owner turned off.
    const visible = modules.filter((m) => !globallyOff.has(m.module));
    if (visible.length === 0) return null;
    return (
      <div key={group} className="flex flex-col gap-0.5">
        <SectionLabel>{group}</SectionLabel>
        {visible.map((m) => {
          const Icon = m.icon;
          return (
            <NavLink
              key={m.module}
              href={`/servers/${id}/${m.configSlug}`}
              label={m.name}
              icon={<Icon className="h-4 w-4 shrink-0" />}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ServerSwitcher
            currentId={id}
            current={{ name: currentName, icon: currentIcon }}
            guilds={switchableGuilds}
          />
        </div>
        <SignOutButton />
      </div>

      <div className="grid gap-6 md:grid-cols-[210px_1fr]">
        {/* Sidebar — collapses behind a Menu button on phones (MobileSidebar). */}
        <nav className="flex flex-col gap-2 md:sticky md:top-6 md:gap-4 md:self-start">
          <MobileSidebar>
          {/* The city group (FiveM) sits above everything else. */}
          {cityGroups.map(renderGroup)}

          <div className="flex flex-col gap-0.5">
            <SectionLabel>Server</SectionLabel>
            {serverNav.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
            ))}
          </div>

          {otherGroups.map(renderGroup)}
          </MobileSidebar>
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
