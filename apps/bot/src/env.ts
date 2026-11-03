import { botEnvSchema, parseEnv, type BotEnv } from '@refx/shared';

/** Validated bot environment. Throws at startup if anything is missing. */
export const env: BotEnv = parseEnv(botEnvSchema);
