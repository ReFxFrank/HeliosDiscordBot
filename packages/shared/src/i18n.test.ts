import { describe, expect, it } from 'vitest';
import { resolveLocale, SUPPORTED_LOCALES, t, type MessageKey } from './i18n';

const KEYS: MessageKey[] = [
  'blacklisted',
  'commandDisabled',
  'moduleDisabled',
  'cannotUseCommand',
  'unexpectedError',
  'dailyClaimed',
  'dailyBonusNote',
  'dailyAlreadyClaimed',
  'workCooldown',
  'paidUser',
  'voteAlreadyClaimed',
  'voteThanks',
];

describe('resolveLocale', () => {
  it('maps regioned Discord locales to their base language', () => {
    expect(resolveLocale('es-ES')).toBe('es');
    expect(resolveLocale('es-419')).toBe('es');
    expect(resolveLocale('pt-BR')).toBe('pt');
    expect(resolveLocale('de')).toBe('de');
    expect(resolveLocale('fr')).toBe('fr');
  });

  it('falls back to English for unsupported or missing locales', () => {
    expect(resolveLocale('ja')).toBe('en');
    expect(resolveLocale('zh-CN')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale('')).toBe('en');
  });
});

describe('t', () => {
  it('returns a non-empty distinct string for every key in every locale', () => {
    for (const key of KEYS) {
      const values = SUPPORTED_LOCALES.map((locale) => t(locale, key));
      for (const value of values) expect(value.length).toBeGreaterThan(0);
      // Translations differ from English (a copied-over value is a bug).
      const [en, ...rest] = values;
      for (const value of rest) expect(value).not.toBe(en);
    }
  });

  it('translates via the Discord locale tag', () => {
    expect(t('es-ES', 'commandDisabled')).toBe('Este comando está desactivado en este servidor.');
    expect(t('ja', 'commandDisabled')).toBe('This command is disabled on this server.');
  });

  it('substitutes every {placeholder} in every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const message = t(locale, 'paidUser', { user: '<@1>', amount: '100 🪙' });
      expect(message).toContain('<@1>');
      expect(message).toContain('100 🪙');
      expect(message).not.toMatch(/\{\w+\}/);
    }
    // Repeated placeholders and missing vars degrade visibly, not silently.
    expect(t('en', 'dailyClaimed', {})).toContain('{amount}');
  });
});
