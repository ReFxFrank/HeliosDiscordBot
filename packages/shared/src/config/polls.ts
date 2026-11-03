import { z } from 'zod';

/**
 * Polls module. Polls are created ad-hoc with /poll; this config sets the
 * server-wide defaults applied at creation (embed color + a default auto-close).
 */
export const pollsConfigSchema = z.object({
  /** Embed color for poll messages (hex). */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #0072ff')
    .default('#0072ff'),
  /** Default auto-close, in hours, when /poll is run without a duration. 0 = none. */
  defaultDurationHours: z.number().int().min(0).max(336).default(0),
});

export type PollsConfig = z.infer<typeof pollsConfigSchema>;
