import type { z } from 'zod';
import type { Module } from '../enums';
import { moderationConfigSchema } from './moderation';
import { levelingConfigSchema } from './leveling';
import { welcomeConfigSchema } from './welcome';

export * from './moderation';
export * from './leveling';
export * from './welcome';

/**
 * Registry mapping a module to the zod schema that validates its `config` JSON
 * blob. Both the bot's config cache and the dashboard's mutation handlers parse
 * against this, so stored config can never violate the schema (§4.1–4.2).
 *
 * Modules are added here as their config pages land in later phases.
 */
export const MODULE_CONFIG_SCHEMAS = {
  MODERATION: moderationConfigSchema,
  LEVELING: levelingConfigSchema,
  WELCOME: welcomeConfigSchema,
} satisfies Partial<Record<Module, z.ZodTypeAny>>;

export type ModuleWithSchema = keyof typeof MODULE_CONFIG_SCHEMAS;

/** Inferred config object type for a module (so consumers needn't import zod). */
export type ModuleConfig<M extends ModuleWithSchema> = z.infer<(typeof MODULE_CONFIG_SCHEMAS)[M]>;

export function hasConfigSchema(module: Module): module is ModuleWithSchema {
  return module in MODULE_CONFIG_SCHEMAS;
}

/** Parse + fill defaults for a module's config blob. Throws on invalid data. */
export function parseModuleConfig<TModule extends ModuleWithSchema>(
  module: TModule,
  raw: unknown,
): z.infer<(typeof MODULE_CONFIG_SCHEMAS)[TModule]> {
  return MODULE_CONFIG_SCHEMAS[module].parse(raw ?? {});
}
