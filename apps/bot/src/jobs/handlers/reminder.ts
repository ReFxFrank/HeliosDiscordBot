import type { ReminderJob } from '@refx/jobs';
import { fireReminder } from '../../modules/reminders';
import type { JobContext } from '../../services/jobs';

export async function handleReminder(data: ReminderJob, ctx: JobContext): Promise<void> {
  await fireReminder(data.reminderId, { client: ctx.client, logger: ctx.logger });
}
