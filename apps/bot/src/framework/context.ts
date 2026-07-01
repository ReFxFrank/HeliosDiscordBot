import type { Client } from 'discord.js';
import type { LavalinkManager } from 'lavalink-client';
import type { PrismaClient } from '@solari/database';
import type { Redis } from 'ioredis';
import type { Logger } from '../logger';
import type { ConfigCache } from '../services/configCache';
import type { JobService } from '../services/jobs';

/**
 * Per-shard singletons handed to every command, event, and precondition. Built
 * once in `client.ts` and threaded through so nothing reaches for module-level
 * globals.
 */
export interface BotContext {
  client: Client;
  logger: Logger;
  prisma: PrismaClient;
  config: ConfigCache;
  jobs: JobService;
  redis: Redis;
  /** Lavalink manager for the Music module, or null when MUSIC_ENABLED is off. */
  music: LavalinkManager | null;
}
