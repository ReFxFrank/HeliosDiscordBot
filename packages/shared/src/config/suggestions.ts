import { z } from 'zod';

export const suggestionsConfigSchema = z.object({
  /** Channel suggestions are posted to. Required for /suggest to work. */
  channelId: z.string().nullable().default(null),
  /** Hide the author on the public suggestion embed. */
  anonymous: z.boolean().default(false),
  /** Roles allowed to approve/deny (in addition to Manage Server). */
  staffRoleIds: z.array(z.string()).default([]),
});

export type SuggestionsConfig = z.infer<typeof suggestionsConfigSchema>;
