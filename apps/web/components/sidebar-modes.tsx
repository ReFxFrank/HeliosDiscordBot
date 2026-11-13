'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/utils';

/**
 * Discord | Twitch switch at the top of the dashboard sidebar. Layouts don't
 * re-render on client navigation, so the active side is worked out here from
 * the current path: anything under /servers/<id>/twitch is the Twitch side,
 * and only that side's links are shown.
 */
export function SidebarModes({
  guildId,
  discord,
  twitch,
}: {
  guildId: string;
  discord: ReactNode;
  twitch: ReactNode;
}) {
  const pathname = usePathname();
  const twitchMode = pathname.split('/')[3] === 'twitch';
  const tab =
    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors';

  return (
    <>
      <div
        className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1"
        role="tablist"
      >
        <Link
          href={`/servers/${guildId}`}
          role="tab"
          aria-selected={!twitchMode}
          className={cn(
            tab,
            !twitchMode ? 'bg-[#5865F2]/30 text-white' : 'text-white/50 hover:text-white/80',
          )}
        >
          Discord
        </Link>
        <Link
          href={`/servers/${guildId}/twitch`}
          role="tab"
          aria-selected={twitchMode}
          className={cn(
            tab,
            twitchMode ? 'bg-[#9146FF]/35 text-white' : 'text-white/50 hover:text-white/80',
          )}
        >
          Twitch
        </Link>
      </div>
      {twitchMode ? twitch : discord}
    </>
  );
}
