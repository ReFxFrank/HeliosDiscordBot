import { prisma } from '@helios/database';
import type { Module } from '@helios/shared';

export interface AuditEntry {
  guildId: string;
  userId: string;
  action: string;
  module?: Module;
  before?: unknown;
  after?: unknown;
}

/** Record a dashboard configuration change (§10). */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await prisma.dashboardAuditLog.create({
    data: {
      guildId: entry.guildId,
      userId: entry.userId,
      action: entry.action,
      module: entry.module ?? null,
      before: entry.before === undefined ? undefined : (entry.before as object),
      after: entry.after === undefined ? undefined : (entry.after as object),
    },
  });
}
