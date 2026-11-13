import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient. In development we stash it on `globalThis` so hot
 * reloads (tsx watch / Next.js) don't open a new pool on every reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
export * from './twitchAccount';
export * from './twitchSongs';
