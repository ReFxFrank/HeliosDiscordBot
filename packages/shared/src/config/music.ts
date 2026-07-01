import { z } from 'zod';

/**
 * Music module config (premium). Governs the DJ permission model, queue limits,
 * and playback defaults. The playback engine is Lavalink v4; see the bot's music
 * service for the runtime.
 */
export const musicConfigSchema = z.object({
  /** Roles allowed to control playback (skip/stop/volume/etc.) beyond mods. */
  djRoleIds: z.array(z.string()).default([]),
  /** When true, only DJs/mods may queue and control; otherwise anyone can queue. */
  djOnly: z.boolean().default(false),
  /** Starting volume applied to new players (0–150). */
  defaultVolume: z.number().int().min(0).max(150).default(100),
  /** Max tracks allowed in a single queue. */
  maxQueueLength: z.number().int().min(1).max(5000).default(500),
  /** Fraction of listeners in the voice channel required to pass a vote-skip. */
  voteSkipRatio: z.number().min(0.1).max(1).default(0.5),
  /** Post a "Now playing" embed when a track starts. */
  announceNowPlaying: z.boolean().default(true),
  /** Seconds to stay connected after the queue empties before auto-leaving. */
  autoLeaveSeconds: z.number().int().min(0).max(3600).default(300),
});

export type MusicConfig = z.infer<typeof musicConfigSchema>;
