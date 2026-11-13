import type { TwitchKeyword } from '@refx/shared';

/**
 * Keyword matching, Fossabot style. Each phrase may carry flags in front:
 * `regex:`, `sensitive:` and `negative:` (any order, chainable). A plain phrase
 * matches anywhere, ignoring case and spaces. A group matches when all of its
 * phrases match; the keyword fires when any group matches.
 */

interface CompiledPhrase {
  negative: boolean;
  test: (text: string) => boolean;
}

export interface CompiledKeyword {
  keyword: TwitchKeyword;
  groups: CompiledPhrase[][];
}

const squash = (value: string) => value.replace(/\s+/g, '');

export function compilePhrase(raw: string): CompiledPhrase | null {
  let rest = raw;
  const flags = new Set<string>();
  for (;;) {
    const match = rest.match(/^(regex|sensitive|negative):/i);
    if (!match?.[1]) break;
    flags.add(match[1].toLowerCase());
    rest = rest.slice(match[0].length);
  }
  if (!rest) return null;
  const sensitive = flags.has('sensitive');
  if (flags.has('regex')) {
    try {
      const pattern = new RegExp(rest, sensitive ? 'u' : 'iu');
      return { negative: flags.has('negative'), test: (text) => pattern.test(text) };
    } catch {
      return null;
    }
  }
  const needle = squash(sensitive ? rest : rest.toLowerCase());
  return {
    negative: flags.has('negative'),
    test: (text) => squash(sensitive ? text : text.toLowerCase()).includes(needle),
  };
}

export function compileKeywords(keywords: TwitchKeyword[]): CompiledKeyword[] {
  return keywords
    .filter((keyword) => keyword.enabled)
    .map((keyword) => ({
      keyword,
      groups: keyword.groups
        .map((group) => group.map(compilePhrase).filter((p): p is CompiledPhrase => p !== null))
        .filter((group) => group.length > 0),
    }))
    .filter((compiled) => compiled.groups.length > 0);
}

export function keywordMatches(
  compiled: CompiledKeyword,
  message: string,
  username: string,
): boolean {
  const targets =
    compiled.keyword.target === 'message'
      ? [message]
      : compiled.keyword.target === 'username'
        ? [username]
        : [message, username];
  return compiled.groups.some((group) =>
    group.every((phrase) => {
      const hit = targets.some((text) => phrase.test(text));
      return phrase.negative ? !hit : hit;
    }),
  );
}
