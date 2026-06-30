import type { z } from 'zod';
import type { Module } from '../enums';
import { moderationConfigSchema } from './moderation';
import { levelingConfigSchema } from './leveling';
import { welcomeConfigSchema } from './welcome';
import { autoroleConfigSchema } from './autorole';
import { loggingConfigSchema } from './logging';
import { starboardConfigSchema } from './starboard';
import { ticketsConfigSchema } from './tickets';
import { refxAlertsConfigSchema } from './refxAlerts';
import { customCommandsConfigSchema } from './customCommands';
import { suggestionsConfigSchema } from './suggestions';
import { birthdaysConfigSchema } from './birthdays';
import { statsCountersConfigSchema } from './statsCounters';
import { inviteTrackingConfigSchema } from './inviteTracking';
import { automodConfigSchema } from './automod';

export * from './moderation';
export * from './automod';
export * from './leveling';
export * from './welcome';
export * from './autorole';
export * from './logging';
export * from './starboard';
export * from './tickets';
export * from './refxAlerts';
export * from './customCommands';
export * from './suggestions';
export * from './birthdays';
export * from './statsCounters';
export * from './inviteTracking';

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
  AUTOROLE: autoroleConfigSchema,
  LOGGING: loggingConfigSchema,
  STARBOARD: starboardConfigSchema,
  TICKETS: ticketsConfigSchema,
  REFX_ALERTS: refxAlertsConfigSchema,
  CUSTOM_COMMANDS: customCommandsConfigSchema,
  SUGGESTIONS: suggestionsConfigSchema,
  BIRTHDAYS: birthdaysConfigSchema,
  STATS_COUNTERS: statsCountersConfigSchema,
  INVITE_TRACKING: inviteTrackingConfigSchema,
  AUTOMOD: automodConfigSchema,
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
