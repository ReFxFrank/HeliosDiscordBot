import { signIn, signOut } from '../auth';

export function LoginButton({ className }: { className?: string }) {
  return (
    <form
      action={async () => {
        'use server';
        await signIn('discord', { redirectTo: '/servers' });
      }}
    >
      <button
        type="submit"
        className={
          className ??
          'inline-flex items-center gap-2 rounded-full bg-[var(--color-blurple)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-blurple)]/85'
        }
      >
        Continue with Discord
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/' });
      }}
    >
      <button
        type="submit"
        className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-[var(--color-danger)]/20"
      >
        Sign out
      </button>
    </form>
  );
}
