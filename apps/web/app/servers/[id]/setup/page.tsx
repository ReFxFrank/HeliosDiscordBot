import { BRAND, SERVER_TEMPLATES } from '@refx/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { ServerTemplates } from '../../../../components/server-templates';

export const dynamic = 'force-dynamic';

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Server Setup</h2>
        <p className="text-sm text-white/50">
          Build a starter layout in one click — categories, text &amp; voice channels, starter
          roles, and the matching {BRAND.name} modules. Everything is added on top of what you
          already have; channels and roles with the same name are never touched or deleted.
          Requires the bot to have <span className="text-white/70">Manage Channels</span> and{' '}
          <span className="text-white/70">Manage Roles</span>.
        </p>
      </div>
      <ServerTemplates guildId={id} templates={SERVER_TEMPLATES} />
    </div>
  );
}
