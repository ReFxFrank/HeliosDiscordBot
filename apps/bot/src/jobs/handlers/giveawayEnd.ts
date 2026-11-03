import type { GiveawayEndJob } from '@refx/jobs';
import { endGiveaway } from '../../modules/giveaway';
import type { JobContext } from '../../services/jobs';

export async function handleGiveawayEnd(data: GiveawayEndJob, ctx: JobContext): Promise<void> {
  await endGiveaway(data.giveawayId, { client: ctx.client, logger: ctx.logger });
}
