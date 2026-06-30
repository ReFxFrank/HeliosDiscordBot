import type { VoiceXpJob } from '@helios/jobs';
import { runVoiceXpTick } from '../../modules/leveling';
import type { JobContext } from '../../services/jobs';

export async function handleVoiceXp(data: VoiceXpJob, ctx: JobContext): Promise<void> {
  await runVoiceXpTick(data.guildId, {
    client: ctx.client,
    logger: ctx.logger,
    jobs: ctx.jobs,
  });
}
