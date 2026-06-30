import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import { GlassCard } from '../../components/ui/glass-card';
import { SignOutButton } from '../../components/auth-buttons';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <Link href="/servers" className="text-sm text-white/50 hover:text-white/80">
        ← Back to servers
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Account</h1>
      <GlassCard className="mt-6 flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          {session.user.image ? (
            <img src={session.user.image} alt="" className="h-12 w-12 rounded-full" />
          ) : null}
          <div>
            <p className="font-medium text-white/90">{session.user.name ?? 'Discord user'}</p>
            <p className="font-mono text-xs text-white/40">{session.user.id}</p>
          </div>
        </div>
        {session.error && (
          <p className="rounded-lg bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
            Your Discord session needs refreshing — sign out and back in.
          </p>
        )}
        <SignOutButton />
      </GlassCard>
    </main>
  );
}
