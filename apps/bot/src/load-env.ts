import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load the monorepo root `.env` as a side effect. `tsx` — unlike `next` — does
 * not auto-load env files, so without this the bot's env validation would fail
 * the moment `./env` is imported. Import this module FIRST, before any module
 * that reads `process.env`.
 *
 * In Docker the variables are already injected via `env_file`, so the root
 * `.env` path simply doesn't exist there — dotenv treats that as a no-op and
 * never overrides values already present in `process.env`.
 */
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env') });
