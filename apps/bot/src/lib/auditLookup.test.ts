import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Guild } from 'discord.js';
import { findMessageDeleter } from './auditLookup';

interface FakeEntry {
  id: string;
  channelId: string;
  targetId: string;
  count: number;
  createdTimestamp: number;
  executorId: string;
}

function fakeGuild(entries: FakeEntry[]): Guild {
  return {
    fetchAuditLogs: async () => ({
      entries: new Map(
        entries.map((e) => [
          e.id,
          {
            id: e.id,
            targetId: e.targetId,
            createdTimestamp: e.createdTimestamp,
            extra: { channel: { id: e.channelId }, count: e.count },
            executor: { id: e.executorId, bot: false },
            target: { id: e.targetId, bot: false },
          },
        ]),
      ),
    }),
  } as unknown as Guild;
}

/** Run a lookup, fast-forwarding past its wait for the audit entry. */
async function lookup(guild: Guild, channelId: string, authorId: string | null) {
  const pending = findMessageDeleter(guild, channelId, authorId);
  await vi.advanceTimersByTimeAsync(2_000);
  return pending;
}

describe('findMessageDeleter', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-02T20:00:00Z') }));
  afterEach(() => vi.useRealTimers());

  it('attributes a fresh entry to its executor and fills in the author', async () => {
    const entry = {
      id: 'e1',
      channelId: 'c1',
      targetId: 'author1',
      count: 1,
      createdTimestamp: Date.now(),
      executorId: 'mod1',
    };
    const result = await lookup(fakeGuild([entry]), 'c1', null);
    expect(result.executor?.id).toBe('mod1');
    expect(result.target?.id).toBe('author1');
  });

  it('treats no matching entry as a self-delete', async () => {
    const result = await lookup(fakeGuild([]), 'c1', 'author1');
    expect(result.executor).toBeNull();
  });

  it('hands out each merged delete once', async () => {
    const entry = {
      id: 'e2',
      channelId: 'c2',
      targetId: 'author2',
      count: 1,
      createdTimestamp: Date.now(),
      executorId: 'mod2',
    };
    const guild = fakeGuild([entry]);
    expect((await lookup(guild, 'c2', 'author2')).executor?.id).toBe('mod2');
    // Same entry, same count: the author deleted a second message themselves.
    expect((await lookup(guild, 'c2', 'author2')).executor).toBeNull();
    // Discord merged another mod delete into the entry (count bumped, old timestamp).
    entry.count = 2;
    expect((await lookup(guild, 'c2', 'author2')).executor?.id).toBe('mod2');
  });

  it('ignores an old entry it has never seen (from before a restart)', async () => {
    const entry = {
      id: 'e3',
      channelId: 'c3',
      targetId: 'author3',
      count: 4,
      createdTimestamp: Date.now() - 10 * 60_000,
      executorId: 'mod3',
    };
    expect((await lookup(fakeGuild([entry]), 'c3', 'author3')).executor).toBeNull();
  });
});
