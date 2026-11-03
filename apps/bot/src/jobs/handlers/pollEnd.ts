import type { PollEndJob } from '@refx/jobs';
import { endPoll } from '../../modules/polls';
import type { JobContext } from '../../services/jobs';

export async function handlePollEnd(data: PollEndJob, ctx: JobContext): Promise<void> {
  await endPoll(data.pollId, { client: ctx.client, logger: ctx.logger });
}
