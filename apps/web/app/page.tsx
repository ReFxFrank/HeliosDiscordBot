import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BRAND } from '@helios/shared';
import { auth } from '../auth';
import { LoginButton } from '../components/auth-buttons';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6">
      <div className="glass w-full rounded-2xl p-10 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-info)]">
          Self-hosted control panel
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">{BRAND.name}</h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-white/60">
          Configure your Discord server from a single glassy panel. Changes go live on the bot in
          under a second — no restarts.
        </p>
        <div className="mt-8 flex justify-center">
          {session?.user ? (
            <Link
              href="/servers"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-blurple)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-blurple)]/85"
            >
              Open dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <LoginButton />
          )}
        </div>
        <div className="mt-6">
          <Link href="/status" className="text-xs text-white/40 hover:text-white/70">
            ReFx Hosting status →
          </Link>
        </div>
      </div>
    </main>
  );
}
