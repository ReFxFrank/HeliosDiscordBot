import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logger } from '../logger';
import type { Command } from './command';
import type { BotEvent } from './event';
import type { ComponentHandler, ComponentModule } from './component';

const SOURCE_RE = /\.(ts|js|mjs)$/;
const SKIP_RE = /\.(test|spec|d)\.(ts|js|mjs)$/;

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (SOURCE_RE.test(entry.name) && !SKIP_RE.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** File-based command loader (§5.1). Each file default-exports a `Command`. */
export async function loadCommands(): Promise<Map<string, Command>> {
  const dir = fileURLToPath(new URL('../commands', import.meta.url));
  const commands = new Map<string, Command>();
  for (const file of await walk(dir)) {
    const mod: { default?: Command } = await import(pathToFileURL(file).href);
    const command = mod.default;
    if (!command?.data?.name || typeof command.execute !== 'function') {
      logger.warn({ file }, 'Skipping file without a valid command default export');
      continue;
    }
    // Not offered by this instance (e.g. FiveM commands on a community bot).
    if (command.available && !command.available()) continue;
    if (commands.has(command.data.name)) {
      logger.warn({ name: command.data.name, file }, 'Duplicate command name; overwriting');
    }
    commands.set(command.data.name, command);
  }
  return commands;
}

/** File-based event loader. Each file default-exports a `BotEvent`. */
export async function loadEvents(): Promise<BotEvent[]> {
  const dir = fileURLToPath(new URL('../events', import.meta.url));
  const events: BotEvent[] = [];
  for (const file of await walk(dir)) {
    const mod: { default?: BotEvent } = await import(pathToFileURL(file).href);
    const event = mod.default;
    if (!event?.name || typeof event.execute !== 'function') {
      logger.warn({ file }, 'Skipping file without a valid event default export');
      continue;
    }
    events.push(event);
  }
  return events;
}

/** File-based component-handler loader. Each file default-exports a ComponentModule. */
export async function loadComponentHandlers(): Promise<Map<string, ComponentHandler>> {
  const dir = fileURLToPath(new URL('../components', import.meta.url));
  const handlers = new Map<string, ComponentHandler>();
  for (const file of await walk(dir)) {
    const mod: { default?: ComponentModule } = await import(pathToFileURL(file).href);
    const component = mod.default;
    if (!component?.module || typeof component.handle !== 'function') {
      logger.warn({ file }, 'Skipping file without a valid component default export');
      continue;
    }
    handlers.set(component.module, component.handle);
  }
  return handlers;
}
