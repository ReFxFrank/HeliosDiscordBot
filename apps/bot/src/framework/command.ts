import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { Module } from '@refx/shared';
import type { BotContext } from './context';

/**
 * Structural type satisfied by every discord.js slash-command builder variant
 * (base, options-only, subcommands-only) — they all expose `name` + `toJSON`.
 * Using a structural type avoids the builder union gymnastics.
 */
export interface CommandData {
  name: string;
  toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
}

export interface PreconditionResult {
  ok: boolean;
  /** User-facing reason, shown when `ok` is false. */
  message?: string;
}

export type Precondition = (
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
) => PreconditionResult | Promise<PreconditionResult>;

export interface Command {
  data: CommandData;
  /** If set, the command requires this module to be enabled for the guild. */
  module?: Module;
  preconditions?: Precondition[];
  execute(interaction: ChatInputCommandInteraction, ctx: BotContext): Promise<void> | void;
  autocomplete?(interaction: AutocompleteInteraction, ctx: BotContext): Promise<void> | void;
}
