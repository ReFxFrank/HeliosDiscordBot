import type { SocialPollJob } from '@refx/jobs';
import { pollSubscription } from '../../modules/social';
import type { JobContext } from '../../services/jobs';

export async function handleSocialPoll(data: SocialPollJob, ctx: JobContext): Promise<void> {
  await pollSubscription(data.subscriptionId, {
    client: ctx.client,
    logger: ctx.logger,
    jobs: ctx.jobs,
  });
}
