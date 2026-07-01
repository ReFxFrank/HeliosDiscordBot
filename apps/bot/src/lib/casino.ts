/**
 * Pure casino primitives — cards, blackjack hand scoring, and roulette — kept
 * free of Discord/DB so they're unit-testable. Randomness is injected where it
 * matters (deck shuffle, wheel spin) via Math.random; the commands own the I/O.
 */

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export interface Card {
  rank: Rank;
  suit: Suit;
}

/** A fresh, ordered 52-card deck. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

/** Fisher–Yates shuffle (in place) returning the same array for chaining. */
export function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = items[i] as T;
    items[i] = items[j] as T;
    items[j] = a;
  }
  return items;
}

/** Blackjack value of a single card (aces count 11 here; softened in handValue). */
function cardPoints(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === '10') return 10;
  return Number(rank);
}

/** Best blackjack total for a hand, demoting aces from 11→1 as needed to avoid a bust. */
export function handValue(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardPoints(card.rank);
    if (card.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export function isBust(cards: Card[]): boolean {
  return handValue(cards) > 21;
}

/** A natural blackjack: exactly two cards totalling 21. */
export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21;
}

export function renderCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function renderHand(cards: Card[]): string {
  return cards.map(renderCard).join('  ');
}

/**
 * Dealer strategy: hit until 17 or more (stands on all 17s, including soft).
 * Mutates and returns the dealer hand, drawing from `deck` (mutated).
 */
export function playDealer(dealer: Card[], deck: Card[]): Card[] {
  while (handValue(dealer) < 17) {
    const card = deck.pop();
    if (!card) break;
    dealer.push(card);
  }
  return dealer;
}

export type BlackjackOutcome = 'player_blackjack' | 'player_win' | 'push' | 'dealer_win';

/** Compare two finished hands. Naturals are scored by the caller before this. */
export function settleBlackjack(player: Card[], dealer: Card[]): BlackjackOutcome {
  const p = handValue(player);
  const d = handValue(dealer);
  if (p > 21) return 'dealer_win';
  if (d > 21) return 'player_win';
  if (p > d) return 'player_win';
  if (p < d) return 'dealer_win';
  return 'push';
}

// ── Roulette ─────────────────────────────────────────────────────────────────

/** European single-zero wheel: red pockets (everything else 1–36 is black; 0 is green). */
const RED_POCKETS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type RouletteColor = 'red' | 'black' | 'green';
export type RouletteBet = 'red' | 'black' | 'green' | 'even' | 'odd' | 'low' | 'high';

export function rouletteColor(pocket: number): RouletteColor {
  if (pocket === 0) return 'green';
  return RED_POCKETS.has(pocket) ? 'red' : 'black';
}

/** Spin the wheel: a pocket 0–36. */
export function spinRoulette(): number {
  return Math.floor(Math.random() * 37);
}

/**
 * TOTAL multiplier of the stake returned for a winning bet (0 if it loses).
 * Even-money bets pay 2× (stake + equal winnings); a green/0 bet pays 36× — the
 * house edge lives in the single green pocket that busts every even-money bet.
 */
export function roulettePayout(bet: RouletteBet, pocket: number): number {
  const color = rouletteColor(pocket);
  if (bet === 'green') return color === 'green' ? 36 : 0;
  if (pocket === 0) return 0; // green busts every even-money bet
  switch (bet) {
    case 'red':
    case 'black':
      return color === bet ? 2 : 0;
    case 'even':
      return pocket % 2 === 0 ? 2 : 0;
    case 'odd':
      return pocket % 2 === 1 ? 2 : 0;
    case 'low':
      return pocket >= 1 && pocket <= 18 ? 2 : 0;
    case 'high':
      return pocket >= 19 && pocket <= 36 ? 2 : 0;
    default:
      return 0;
  }
}

export const ROULETTE_BET_LABEL: Record<RouletteBet, string> = {
  red: '🔴 Red',
  black: '⚫ Black',
  green: '🟢 Green (0)',
  even: 'Even',
  odd: 'Odd',
  low: 'Low (1–18)',
  high: 'High (19–36)',
};

/** Colored circle for rendering a landed pocket. */
export function rouletteEmoji(pocket: number): string {
  const color = rouletteColor(pocket);
  return color === 'green' ? '🟢' : color === 'red' ? '🔴' : '⚫';
}
