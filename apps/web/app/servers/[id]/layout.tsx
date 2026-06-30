import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { prisma } from '@helios/database';
import { guardGuildAccess } from '../../../lib/auth-guards';
import { guildIconUrl } from '../../../lib/discord';
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

  const guild = await prisma.guild.findUnique({ where: { id } });
  if (!guild) notFound();

  const icon = guildIconUrl(id, guild.icon, 48);
  const nav = [
    { href: `/servers/${id}`, label: 'Overview' },
    { href: `/servers/${id}/moderation`, label: 'Moderation' },
    { href: `/servers/${id}/settings`, label: 'Settings' },
    { href: `/servers/${id}/audit`, label: 'Audit log' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/servers" className="text-white/40 hover:text-white/70">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          {icon ? (
            <img src={icon} alt="" className="h-10 w-10 rounded-xl" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-sm font-semibold text-white/60">
              {(guild.name ?? '?').slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="font-semibold leading-tight text-white/90">{guild.name ?? id}</h1>
            <p className="font-mono text-xs text-white/40">{id}</p>
          </div>
        </div>
        <SignOutButton />
      </div>

      <div className="grid gap-6 md:grid-cols-[180px_1fr]">
        <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
