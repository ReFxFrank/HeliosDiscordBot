import { prisma } from '@refx/database';
import { customCommandsConfigSchema, embedSpecSchema, type EmbedSpec } from '@refx/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { AutoRespondersForm } from '../../../../components/auto-responders-form';
import {
  CustomCommandsManager,
  type TagSummary,
} from '../../../../components/custom-commands-manager';
import { GlassCard } from '../../../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

export default async function CommandsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [configRow, tagRows] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'CUSTOM_COMMANDS' } },
      select: { config: true },
    }),
    prisma.customCommand.findMany({
      where: { guildId: id },
      orderBy: { name: 'asc' },
      take: 100,
      select: { name: true, content: true, embed: true, uses: true },
    }),
  ]);

  const config = customCommandsConfigSchema.parse(configRow?.config ?? {});
  const tags: TagSummary[] = tagRows.map((tag) => {
    const parsedEmbed = tag.embed ? embedSpecSchema.safeParse(tag.embed) : null;
    return {
      name: tag.name,
      content: tag.content,
      embed: parsedEmbed?.success ? (parsedEmbed.data as EmbedSpec) : null,
      uses: tag.uses,
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Custom commands</h2>
        <p className="text-sm text-white/50">
          Tags with text or embeds, plus keyword auto-responders.
        </p>
      </div>

      <CustomCommandsManager guildId={id} tags={tags} />

      <div>
        <h3 className="mb-3 text-sm font-semibold text-white/80">Prefix & auto-responders</h3>
        <GlassCard className="p-5">
          <AutoRespondersForm guildId={id} initial={config} />
        </GlassCard>
      </div>
    </div>
  );
}
