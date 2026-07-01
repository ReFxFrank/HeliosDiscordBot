import { prisma, type EconomyUser } from '@solari/database';
import type { EconomyConfig } from '@solari/shared';

/** Fetch (or lazily create) a member's economy row, seeded with the start balance. */
export async function getEconomyUser(
  guildId: string,
  userId: string,
  startingBalance = 0,
): Promise<EconomyUser> {
  return prisma.economyUser.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: {},
    create: { guildId, userId, wallet: startingBalance },
  });
}

/** Atomically adjust a member's wallet (row must exist — call getEconomyUser first). */
export async function addWallet(guildId: string, userId: string, delta: number): Promise<void> {
  await prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: { wallet: { increment: delta } },
  });
}

export type BalanceField = 'wallet' | 'bank';

/**
 * Admin edit: add (or subtract, if `delta` is negative) to a balance field,
 * flooring at 0. Lazily creates the row and returns the new balance.
 */
export async function addToBalance(
  guildId: string,
  userId: string,
  delta: number,
  field: BalanceField,
  startingBalance = 0,
): Promise<number> {
  const user = await getEconomyUser(guildId, userId, startingBalance);
  const next = Math.max(0, (field === 'wallet' ? user.wallet : user.bank) + delta);
  await prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: field === 'wallet' ? { wallet: next } : { bank: next },
  });
  return next;
}

/** Admin edit: set a balance field to an exact amount. Lazily creates the row. */
export async function setBalance(
  guildId: string,
  userId: string,
  amount: number,
  field: BalanceField,
  startingBalance = 0,
): Promise<void> {
  await getEconomyUser(guildId, userId, startingBalance);
  await prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: field === 'wallet' ? { wallet: amount } : { bank: amount },
  });
}

/** Admin edit: wipe every economy balance in a guild. Returns the row count removed. */
export function resetGuildEconomy(guildId: string): Promise<{ count: number }> {
  return prisma.economyUser.deleteMany({ where: { guildId } });
}

/**
 * Race-safe conditional debit: decrement only if the wallet still holds at least
 * `amount`. Returns true if the debit applied. Prevents a wallet going negative
 * when two spend commands run concurrently.
 */
export async function trySpendWallet(
  guildId: string,
  userId: string,
  amount: number,
): Promise<boolean> {
  const res = await prisma.economyUser.updateMany({
    where: { guildId, userId, wallet: { gte: amount } },
    data: { wallet: { decrement: amount } },
  });
  return res.count > 0;
}

/** Race-safe conditional debit from the bank. */
export async function trySpendBank(
  guildId: string,
  userId: string,
  amount: number,
): Promise<boolean> {
  const res = await prisma.economyUser.updateMany({
    where: { guildId, userId, bank: { gte: amount } },
    data: { bank: { decrement: amount } },
  });
  return res.count > 0;
}

/**
 * Atomically move `amount` between two members' wallets. The guarded debit and
 * the credit commit together (or roll back together), so money can never be
 * destroyed or duplicated mid-transfer. Returns false on insufficient funds.
 * Both rows must exist first (call getEconomyUser).
 */
export async function tryTransferWallet(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const debit = await tx.economyUser.updateMany({
      where: { guildId, userId: fromUserId, wallet: { gte: amount } },
      data: { wallet: { decrement: amount } },
    });
    if (debit.count === 0) return false;
    await tx.economyUser.update({
      where: { guildId_userId: { guildId, userId: toUserId } },
      data: { wallet: { increment: amount } },
    });
    return true;
  });
}

/** Atomic wallet↔bank move within one member. `toBank` deposits, else withdraws. */
export async function tryMoveMoney(
  guildId: string,
  userId: string,
  amount: number,
  toBank: boolean,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const debit = await tx.economyUser.updateMany({
      where: toBank
        ? { guildId, userId, wallet: { gte: amount } }
        : { guildId, userId, bank: { gte: amount } },
      data: toBank ? { wallet: { decrement: amount } } : { bank: { decrement: amount } },
    });
    if (debit.count === 0) return false;
    await tx.economyUser.update({
      where: { guildId_userId: { guildId, userId } },
      data: toBank ? { bank: { increment: amount } } : { wallet: { increment: amount } },
    });
    return true;
  });
}

/**
 * Atomically escrow a bet and pay out the total return in one transaction, so a
 * mid-command failure can't take the bet without paying a win. `payout` is the
 * TOTAL returned (0 = lost). Returns false on insufficient funds.
 */
export async function settleBet(
  guildId: string,
  userId: string,
  bet: number,
  payout: number,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const debit = await tx.economyUser.updateMany({
      where: { guildId, userId, wallet: { gte: bet } },
      data: { wallet: { decrement: bet } },
    });
    if (debit.count === 0) return false;
    if (payout > 0) {
      await tx.economyUser.update({
        where: { guildId_userId: { guildId, userId } },
        data: { wallet: { increment: payout } },
      });
    }
    return true;
  });
}

/** Atomic cooldown-gated grant for /daily. Returns false if still on cooldown. */
export async function tryClaimDaily(
  guildId: string,
  userId: string,
  amount: number,
  cooldownSeconds: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
  const res = await prisma.economyUser.updateMany({
    where: { guildId, userId, OR: [{ lastDaily: null }, { lastDaily: { lte: cutoff } }] },
    data: { wallet: { increment: amount }, lastDaily: new Date() },
  });
  return res.count > 0;
}

/**
 * Atomic rob-cooldown gate: stamp `lastRob` only if the cooldown has elapsed.
 * Returns true if the attempt may proceed (concurrent /rob can't double-stamp).
 * The row must already exist (call getEconomyUser first).
 */
export async function tryStampRob(
  guildId: string,
  userId: string,
  cooldownSeconds: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
  const res = await prisma.economyUser.updateMany({
    where: { guildId, userId, OR: [{ lastRob: null }, { lastRob: { lte: cutoff } }] },
    data: { lastRob: new Date() },
  });
  return res.count > 0;
}

/** Atomic cooldown-gated grant for /work. Returns false if still on cooldown. */
export async function tryClaimWork(
  guildId: string,
  userId: string,
  amount: number,
  cooldownSeconds: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
  const res = await prisma.economyUser.updateMany({
    where: { guildId, userId, OR: [{ lastWork: null }, { lastWork: { lte: cutoff } }] },
    data: { wallet: { increment: amount }, lastWork: new Date() },
  });
  return res.count > 0;
}

/** Format an amount with the guild's currency symbol. */
export function formatMoney(amount: number, config: Pick<EconomyConfig, 'currencySymbol'>): string {
  return `**${amount.toLocaleString('en-US')}** ${config.currencySymbol}`;
}

/** Remaining cooldown in ms (0 if ready). */
export function cooldownRemaining(last: Date | null, seconds: number): number {
  if (!last) return 0;
  return Math.max(0, seconds * 1000 - (Date.now() - last.getTime()));
}

/** Human-readable duration, e.g. "1h 4m 12s". */
export function formatDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

/**
 * Resolve and clamp a bet against the actor's wallet and the guild's max bet.
 * Returns the usable amount, or an error string.
 */
export function resolveBet(
  amount: number,
  wallet: number,
  maxBet: number,
  minBet = 1,
): { ok: true; amount: number } | { ok: false; error: string } {
  if (!Number.isFinite(amount) || amount < minBet) {
    return { ok: false, error: `Bet at least ${minBet.toLocaleString('en-US')}.` };
  }
  if (amount > maxBet) return { ok: false, error: `The max bet is ${maxBet.toLocaleString('en-US')}.` };
  if (amount > wallet) return { ok: false, error: "You don't have that much in your wallet." };
  return { ok: true, amount };
}
