import { z } from 'zod';

/** Casino games sub-config. Games read this to gate themselves and set payouts. */
export const casinoConfigSchema = z
  .object({
    /** Per-game on/off switches. */
    blackjack: z.boolean().default(true),
    roulette: z.boolean().default(true),
    coinflip: z.boolean().default(true),
    slots: z.boolean().default(true),
    dice: z.boolean().default(true),
    /** Bet bounds for every casino game. */
    minBet: z.number().int().min(1).max(100_000_000).default(10),
    maxBet: z.number().int().min(1).max(100_000_000).default(10_000),
    /** Slots payout multipliers (total returned = stake × multiplier). */
    slotsTripleMultiplier: z.number().min(1).max(1000).default(3),
    slotsPairMultiplier: z.number().min(0).max(1000).default(1.5),
    /** Blackjack natural (two-card 21) payout multiplier. Standard is 2.5 (3:2). */
    blackjackMultiplier: z.number().min(1).max(10).default(2.5),
  })
  .default({});

export type CasinoConfig = z.infer<typeof casinoConfigSchema>;

/** A role that grants a bonus on top of the base /daily payout. */
export const incomeRoleSchema = z.object({
  roleId: z.string(),
  dailyBonus: z.number().int().min(0).max(1_000_000).default(0),
});
export type IncomeRole = z.infer<typeof incomeRoleSchema>;

/**
 * A buyable shop item. Purchasing debits `price` from the wallet and, when
 * `roleId` is set, grants that role (role-shop model — no inventory needed).
 */
export const shopItemSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(64),
  description: z.string().max(200).default(''),
  price: z.number().int().min(0).max(1_000_000_000).default(100),
  roleId: z.string().nullable().default(null),
});
export type ShopItem = z.infer<typeof shopItemSchema>;

/**
 * Economy module config (premium). Currency naming, earn amounts + cooldowns,
 * and gambling limits. Balances live in the EconomyUser table; these are the
 * per-guild knobs the dashboard exposes.
 */
export const economyConfigSchema = z.object({
  /** Name of the currency (plural), e.g. "coins". */
  currencyName: z.string().min(1).max(32).default('coins'),
  /** Emoji or short symbol shown next to amounts. */
  currencySymbol: z.string().min(1).max(16).default('🪙'),
  /** Balance a brand-new member starts with. */
  startingBalance: z.number().int().min(0).max(1_000_000).default(0),
  /** Amount granted by /daily. */
  dailyAmount: z.number().int().min(0).max(1_000_000).default(250),
  /** Reward for a top.gg vote (/vote; doubled on weekend votes). 0 disables. */
  voteReward: z.number().int().min(0).max(1_000_000).default(250),
  /** /work pays a random amount in [workMin, workMax]. */
  workMin: z.number().int().min(0).max(1_000_000).default(50),
  workMax: z.number().int().min(0).max(1_000_000).default(250),
  /** Cooldown between /work uses. */
  workCooldownSeconds: z.number().int().min(0).max(604_800).default(3600),
  /** Largest bet allowed in gambling commands. */
  maxBet: z.number().int().min(1).max(100_000_000).default(10_000),
  /** Whether /rob is available. */
  robEnabled: z.boolean().default(true),
  /** Percent chance a /rob attempt succeeds (0–100). */
  robSuccessRate: z.number().int().min(0).max(100).default(50),
  /** Cooldown between /rob attempts. */
  robCooldownSeconds: z.number().int().min(0).max(604_800).default(3_600),
  /** On a failed rob, the robber pays the victim this percent of their own wallet. */
  robFinePercent: z.number().int().min(0).max(100).default(10),
  /** Roles that add a bonus to the /daily payout (summed across a member's roles). */
  incomeRoles: z.array(incomeRoleSchema).max(25).default([]),
  /** Buyable role-shop items (see /shop and /buy). */
  shopItems: z.array(shopItemSchema).max(50).default([]),
  /** Casino games + their limits and payouts. */
  casino: casinoConfigSchema,
});

export type EconomyConfig = z.infer<typeof economyConfigSchema>;
