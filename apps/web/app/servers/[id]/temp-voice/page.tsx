import { prisma } from '@refx/database';
import { tempVoiceConfigSchema } from '@refx/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildChannels } from '../../../../lib/discord-guild';
import { TempVoiceForm } from '../../../../components/temp-voice-form';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function TempVoiceConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, channels] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'TEMP_VOICE' } },
      select: { config: true },
    }),
    getGuildChannels(id),
  ]);
  const initial = tempVoiceConfigSchema.parse(row?.config ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Temp Voice</h2>
        <p className="text-sm text-white/50">
          Join-to-create voice channels. Members who join a hub get their own channel to manage
          with <code className="text-white/70">/voice</code>.
        </p>
      </div>
      <GlassCard className="p-5">
        <TempVoiceForm guildId={id} initial={initial} channels={channels} />
      </GlassCard>
    </div>
  );
}
