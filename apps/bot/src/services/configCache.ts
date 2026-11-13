import { prisma } from '@refx/database';
import {
  REDIS_CHANNELS,
  configCacheKey,
  hasConfigSchema,
  parseModuleConfig,
  type ConfigUpdateMessage,
  type Module,
  type ModuleConfig,
  type ModuleWithSchema,
} from '@refx/shared';
import { logger } from '../logger';
import { subscriber } from './redis';

interface CacheEntry {
  /** Parsed config (with defaults filled). */
  value: unknown;
  /** Whether the module row exists and is enabled. */
  enabled: boolean;
  /** Epoch ms when this entry was loaded. */
  loadedAt: number;
}

/**
 * Per-guild, per-module config cache (§4.2).
 *
 * Reads are served from an in-memory Map. The dashboard publishes
 * `helios:config:update` after a write; the subscriber here evicts the matching
 * entry so the next read lazily reloads from Postgres — config changes go live
 * in <1s without a restart.
 *
 * A short TTL is layered on top as a safety net (flag): Redis pub/sub has no
 * delivery guarantee, so if an invalidation is missed (e.g. a brief subscriber
 * disconnect) a stale entry still self-heals within `ttlMs`.
 */
export class ConfigCache {
  private readonly store = new Map<string, CacheEntry>();
  /** Modules the bot owner has globally disabled (across every guild). */
  private globalDisabled = new Set<Module>();
  private globalLoadedAt = 0;
  private readonly globalTtlMs = 30_000;
  /** Per-guild command kill-switches (Guild.disabledCommands), short-TTL cached. */
  private readonly commandToggles = new Map<string, { set: Set<string>; loadedAt: number }>();
  private readonly commandTogglesTtlMs = 30_000;

  private readonly listeners: ((guildId: string, module: Module) => void)[] = [];

  constructor(private readonly ttlMs = 5 * 60 * 1000) {}

  /** Be told after a dashboard write invalidates a guild's module config. */
  onUpdate(listener: (guildId: string, module: Module) => void): void {
    this.listeners.push(listener);
  }

  /** Begin listening for invalidation messages. Call once at startup. */
  async start(): Promise<void> {
    await this.refreshGlobalFlags();
    await subscriber.subscribe(REDIS_CHANNELS.configUpdate);
    subscriber.on('message', (channel, raw) => {
      if (channel !== REDIS_CHANNELS.configUpdate) return;
      try {
        const msg = JSON.parse(raw) as ConfigUpdateMessage;
        this.invalidate(msg.guildId, msg.module);
        for (const listener of this.listeners) {
          try {
            listener(msg.guildId, msg.module);
          } catch (err) {
            logger.warn({ err }, 'Config update listener failed');
          }
        }
        logger.debug({ guildId: msg.guildId, module: msg.module }, 'Config cache invalidated');
      } catch (err) {
        logger.warn({ err, raw }, 'Ignoring malformed config:update message');
      }
    });
    logger.info('Config cache subscribed to invalidation channel');
  }

  invalidate(guildId: string, module: Module): void {
    this.store.delete(configCacheKey(guildId, module));
  }

  private fresh(entry: CacheEntry | undefined): entry is CacheEntry {
    return entry !== undefined && Date.now() - entry.loadedAt < this.ttlMs;
  }

  private async load(guildId: string, module: Module): Promise<CacheEntry> {
    const row = await prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId, module } },
    });
    const value = hasConfigSchema(module)
      ? parseModuleConfig(module, row?.config ?? {})
      : (row?.config ?? {});
    const entry: CacheEntry = { value, enabled: row?.enabled ?? false, loadedAt: Date.now() };
    this.store.set(configCacheKey(guildId, module), entry);
    return entry;
  }

  private async resolve(guildId: string, module: Module): Promise<CacheEntry> {
    const cached = this.store.get(configCacheKey(guildId, module));
    if (this.fresh(cached)) return cached;
    return this.load(guildId, module);
  }

  /** Typed config getter for modules with a registered zod schema. */
  async getConfig<M extends ModuleWithSchema>(
    guildId: string,
    module: M,
  ): Promise<ModuleConfig<M>> {
    const entry = await this.resolve(guildId, module);
    return entry.value as ModuleConfig<M>;
  }

  /**
   * Refresh the owner's global feature flags on a short TTL. Fails OPEN: a DB
   * error keeps the last-known set rather than disabling (or enabling) the world.
   */
  private async refreshGlobalFlags(): Promise<void> {
    if (Date.now() - this.globalLoadedAt < this.globalTtlMs) return;
    try {
      const rows = await prisma.globalModuleFlag.findMany({
        where: { enabled: false },
        select: { module: true },
      });
      this.globalDisabled = new Set(rows.map((r: { module: string }) => r.module as Module));
    } catch {
      // keep the previous set; just back off so we retry after the TTL
    }
    this.globalLoadedAt = Date.now();
  }

  /**
   * Whether a module is enabled for a guild. A module the owner has globally
   * disabled is off everywhere, regardless of the per-guild setting — this is
   * the single gate both command dispatch and event handlers consult.
   */
  async isEnabled(guildId: string, module: Module): Promise<boolean> {
    await this.refreshGlobalFlags();
    if (this.globalDisabled.has(module)) return false;
    const entry = await this.resolve(guildId, module);
    return entry.enabled;
  }

  /**
   * The set of slash commands this guild's admins have disabled. Served from a
   * short-TTL cache; the dashboard publishes REFRESH_COMMAND_TOGGLES on change
   * so it goes live in ~1s, with the TTL as the pub/sub safety net. Fails OPEN
   * (empty set) on a DB error — a hiccup must not turn every command off.
   */
  async getDisabledCommands(guildId: string): Promise<Set<string>> {
    const cached = this.commandToggles.get(guildId);
    if (cached && Date.now() - cached.loadedAt < this.commandTogglesTtlMs) return cached.set;
    try {
      const row = await prisma.guild.findUnique({
        where: { id: guildId },
        select: { disabledCommands: true },
      });
      const set = new Set(row?.disabledCommands ?? []);
      this.commandToggles.set(guildId, { set, loadedAt: Date.now() });
      return set;
    } catch {
      return cached?.set ?? new Set();
    }
  }

  /** Evict a guild's command-toggle entry (REFRESH_COMMAND_TOGGLES live command). */
  invalidateCommandToggles(guildId: string): void {
    this.commandToggles.delete(guildId);
  }

  /** Test/diagnostic helper. */
  clear(): void {
    this.store.clear();
    this.commandToggles.clear();
  }
}
