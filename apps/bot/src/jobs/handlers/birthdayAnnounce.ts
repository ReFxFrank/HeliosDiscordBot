import type { BirthdayAnnounceJob } from '@helios/jobs';
import { runBirthdayAnnounce } from '../../modules/birthdays';
import type { JobContext } from '../../services/jobs';

export async function handleBirthdayAnnounce(
  data: BirthdayAnnounceJob,
  ctx: JobContext,
): Promise<void> {
  await runBirthdayAnnounce(data.guildId, {
    client: ctx.client,
    logger: ctx.logger,
    jobs: ctx.jobs,
  });
}
