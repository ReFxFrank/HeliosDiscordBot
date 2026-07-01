import { describe, expect, it } from 'vitest';
import {
  createDeck,
  handValue,
  isBlackjack,
  isBust,
  rouletteColor,
  roulettePayout,
  settleBlackjack,
  type Card,
} from './casino';

const c = (rank: Card['rank'], suit: Card['suit'] = '♠'): Card => ({ rank, suit });

describe('createDeck', () => {
  it('is 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((d) => `${d.rank}${d.suit}`)).size).toBe(52);
  });
});

describe('handValue', () => {
  it('scores face cards as 10 and demotes aces to avoid busting', () => {
    expect(handValue([c('K'), c('7')])).toBe(17);
    expect(handValue([c('A'), c('K')])).toBe(21); // soft 21
    expect(handValue([c('A'), c('A'), c('9')])).toBe(21); // one ace 11, one 1
    expect(handValue([c('A'), c('K'), c('K')])).toBe(21); // ace demoted to 1
    expect(handValue([c('K'), c('Q'), c('5')])).toBe(25); // busts
  });

  it('detects blackjack and bust', () => {
    expect(isBlackjack([c('A'), c('J')])).toBe(true);
    expect(isBlackjack([c('A'), c('5'), c('5')])).toBe(false); // 21 but 3 cards
    expect(isBust([c('K'), c('Q'), c('2')])).toBe(true);
    expect(isBust([c('K'), c('Q')])).toBe(false);
  });
});

describe('settleBlackjack', () => {
  it('resolves the standard outcomes', () => {
    expect(settleBlackjack([c('K'), c('Q')], [c('K'), c('7')])).toBe('player_win'); // 20 vs 17
    expect(settleBlackjack([c('K'), c('7')], [c('K'), c('Q')])).toBe('dealer_win'); // 17 vs 20
    expect(settleBlackjack([c('K'), c('Q')], [c('K'), c('Q')])).toBe('push'); // 20 vs 20
    expect(settleBlackjack([c('K'), c('Q'), c('5')], [c('K'), c('7')])).toBe('dealer_win'); // player bust
    expect(settleBlackjack([c('K'), c('Q')], [c('K'), c('Q'), c('5')])).toBe('player_win'); // dealer bust
  });
});

describe('roulette', () => {
  it('colors the wheel correctly', () => {
    expect(rouletteColor(0)).toBe('green');
    expect(rouletteColor(1)).toBe('red');
    expect(rouletteColor(2)).toBe('black');
    expect(rouletteColor(36)).toBe('red');
  });

  it('pays even-money bets 2x and busts them on green', () => {
    expect(roulettePayout('red', 1)).toBe(2);
    expect(roulettePayout('red', 2)).toBe(0);
    expect(roulettePayout('even', 2)).toBe(2);
    expect(roulettePayout('odd', 2)).toBe(0);
    expect(roulettePayout('low', 18)).toBe(2);
    expect(roulettePayout('high', 19)).toBe(2);
    // Green pocket busts every even-money bet.
    expect(roulettePayout('red', 0)).toBe(0);
    expect(roulettePayout('even', 0)).toBe(0);
    expect(roulettePayout('low', 0)).toBe(0);
  });

  it('pays a green bet 36x only on 0', () => {
    expect(roulettePayout('green', 0)).toBe(36);
    expect(roulettePayout('green', 5)).toBe(0);
  });
});
