import { notFound } from 'next/navigation';
import { prisma } from '@helios/database';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { SettingsForm } from '../../../../components/settings-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const guild = await prisma.guild.findUnique({
    where: { id },
    select: { locale: true, timezone: true, prefix: true },
  });
  if (!guild) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Server settings</h2>
        <p className="text-sm text-white/50">Locale, timezone, and legacy prefix.</p>
      </div>
      <GlassCard className="p-5">
        <SettingsForm
          guildId={id}
          initial={{ locale: guild.locale, timezone: guild.timezone, prefix: guild.prefix }}
        />
      </GlassCard>
    </div>
  );
}
