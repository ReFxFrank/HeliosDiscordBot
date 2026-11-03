'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@refx/database';
import { MODULES, MODULE_CONFIG_SCHEMAS, type Module, type ModuleWithSchema } from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { applyModuleConfig, applyModuleEnabled } from './config-core';

/**
 * Whole-server config backup + transfer. The export is a plain JSON snapshot
 * of every module's enabled flag + config blob; importing replays it through
 * the SAME validated, audited per-module path as a dashboard save, so a
 * malformed or hostile file can only be skipped, never applied raw.
 */

export async function exportGuildConfig(guildId: string): Promise<string> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  const rows = await prisma.guildModuleConfig.findMany({
    where: { guildId },
    select: { module: true, enabled: true, config: true },
  });
  const modules: Record<string, { enabled: boolean; config: unknown }> = {};
  for (const row of rows) modules[row.module] = { enabled: row.enabled, config: row.config };
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), modules }, null, 2);
}

const importSchema = z.object({
  version: z.literal(1),
  modules: z.record(
    z.string(),
    z.object({ enabled: z.boolean(), config: z.unknown().optional() }),
  ),
});

export interface ImportSummary {
  ok: boolean;
  error?: string;
  applied: string[];
  skipped: { module: string; reason: string }[];
}

export async function importGuildConfig(guildId: string, raw: string): Promise<ImportSummary> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  let parsed: z.infer<typeof importSchema>;
  try {
    parsed = importSchema.parse(JSON.parse(raw));
  } catch {
    return {
      ok: false,
      error: 'That file is not a valid ReFx Assistant config export.',
      applied: [],
      skipped: [],
    };
  }

  const flags = await prisma.globalModuleFlag.findMany({ where: { enabled: false }, select: { module: true } });
  const globallyOff = new Set(flags.map((flag) => flag.module));

  const applied: string[] = [];
  const skipped: ImportSummary['skipped'] = [];
  for (const [name, entry] of Object.entries(parsed.modules)) {
    if (!(MODULES as readonly string[]).includes(name)) {
      skipped.push({ module: name, reason: 'unknown module' });
      continue;
    }
    const module = name as Module;
    if (globallyOff.has(module)) {
      skipped.push({ module: name, reason: 'disabled by the bot operator' });
      continue;
    }
    if (entry.config !== undefined && module in MODULE_CONFIG_SCHEMAS) {
      const result = await applyModuleConfig(
        guildId,
        module as ModuleWithSchema,
        entry.config,
        session.user.id,
      );
      if (!result.ok) {
        skipped.push({ module: name, reason: 'invalid config' });
        continue;
      }
    }
    await applyModuleEnabled(guildId, module, entry.enabled, session.user.id);
    applied.push(name);
  }

  revalidatePath(`/servers/${guildId}`);
  return { ok: true, applied, skipped };
}
