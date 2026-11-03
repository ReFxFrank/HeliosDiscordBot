import { prisma } from '@refx/database';
import { verificationConfigSchema } from '@refx/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { VerificationForm } from '../../../../components/verification-form';

export const dynamic = 'force-dynamic';

export default async function VerificationConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, automodRow, { roles, channels }] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'VERIFICATION' } },
      select: { config: true },
    }),
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'AUTOMOD' } },
      select: { config: true },
    }),
    getGuildEntities(id),
  ]);

  // Verification used to live inside Automod. When this module has no config of
  // its own yet, seed the form from the legacy blob so guilds that had button
  // verification set up don't start from scratch (field names are compatible).
  let seed: unknown = row?.config ?? {};
  if (!row) {
    const legacy = (automodRow?.config as { verification?: unknown } | null)?.verification;
    if (legacy && typeof legacy === 'object') seed = legacy;
  }
  const initial = verificationConfigSchema.parse(seed);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Verification</h2>
        <p className="text-sm text-white/50">
          Gate new members behind a button or image captcha before they can see the server. Saved
          changes reach the bot in ~1s.
        </p>
      </div>
      <VerificationForm guildId={id} initial={initial} roles={roles} channels={channels} />
    </div>
  );
}
