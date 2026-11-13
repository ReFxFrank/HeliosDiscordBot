import { safeFetchText } from '../safeFetch';
import { fetchLatest } from '../social';
import { fetchTikTokVideos } from '../tiktok';

/**
 * Everything the Twitch chat bot fetches from outside Twitch: fun commands
 * (jokes, facts, dictionaries), weather, third-party emotes, latest posts,
 * and game/music stats. All calls time out quickly and return a short,
 * chat-ready string (or an explanation) instead of throwing.
 */

const UA = 'TwitchChatBot/1.0 (+https://twitch.tv)';
const cache = new Map<string, { at: number; value: string }>();

async function cached(key: string, ttlMs: number, load: () => Promise<string>): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 2000) {
    for (const [k, v] of cache) if (Date.now() - v.at > 3_600_000) cache.delete(k);
  }
  return value;
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const clip = (text: string, max = 400) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

// ── Fun ─────────────────────────────────────────────────────────────────────

const EIGHT_BALL = [
  'It is certain.',
  'It is decidedly so.',
  'Without a doubt.',
  'Yes, definitely.',
  'You may rely on it.',
  'As I see it, yes.',
  'Most likely.',
  'Outlook good.',
  'Yes.',
  'Signs point to yes.',
  'Reply hazy, try again.',
  'Ask again later.',
  'Better not tell you now.',
  'Cannot predict now.',
  'Concentrate and ask again.',
  'Don’t count on it.',
  'My reply is no.',
  'My sources say no.',
  'Outlook not so good.',
  'Very doubtful.',
];

export function eightBall(random = Math.random): string {
  return EIGHT_BALL[Math.floor(random() * EIGHT_BALL.length)] ?? 'Ask again later.';
}

export async function dadJoke(): Promise<string> {
  const json = await getJson<{ joke?: string }>('https://icanhazdadjoke.com/');
  return json?.joke ? clip(oneLine(json.joke)) : 'I’m out of dad jokes right now.';
}

export async function randomFact(): Promise<string> {
  const json = await getJson<{ text?: string }>(
    'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en',
  );
  return json?.text ? clip(oneLine(json.text)) : 'No facts available right now.';
}

export async function dictionary(word: string): Promise<string> {
  if (!word) return 'Give me a word to look up.';
  return cached(`dict:${word.toLowerCase()}`, 86_400_000, async () => {
    const json = await getJson<
      {
        word: string;
        meanings?: { partOfSpeech: string; definitions: { definition: string }[] }[];
      }[]
    >(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    const meaning = json?.[0]?.meanings?.[0];
    const definition = meaning?.definitions[0]?.definition;
    return definition
      ? clip(`${json?.[0]?.word} (${meaning?.partOfSpeech}): ${oneLine(definition)}`)
      : `No definition found for “${word}”.`;
  });
}

export async function urban(term: string): Promise<string> {
  if (!term) return 'Give me something to look up.';
  return cached(`urban:${term.toLowerCase()}`, 3_600_000, async () => {
    const json = await getJson<{ list?: { word: string; definition: string }[] }>(
      `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
    );
    const entry = json?.list?.[0];
    return entry
      ? clip(`${entry.word}: ${oneLine(entry.definition.replace(/[[\]]/g, ''))}`)
      : `No Urban Dictionary entry for “${term}”.`;
  });
}

// ── Weather & time ──────────────────────────────────────────────────────────

const WEATHER_CODES: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'foggy',
  48: 'icy fog',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  66: 'freezing rain',
  67: 'heavy freezing rain',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'rain showers',
  81: 'rain showers',
  82: 'violent rain showers',
  85: 'snow showers',
  86: 'heavy snow showers',
  95: 'thunderstorm',
  96: 'thunderstorm with hail',
  99: 'thunderstorm with heavy hail',
};

export async function weather(place: string): Promise<string> {
  if (!place) return 'Give me a place, e.g. $(weather London).';
  return cached(`weather:${place.toLowerCase()}`, 600_000, async () => {
    const geo = await getJson<{
      results?: { name: string; country?: string; latitude: number; longitude: number }[];
    }>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en`,
    );
    const spot = geo?.results?.[0];
    if (!spot) return `I couldn’t find “${place}”.`;
    const now = await getJson<{
      current?: { temperature_2m: number; weather_code: number; wind_speed_10m: number };
    }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${spot.latitude}&longitude=${spot.longitude}&current=temperature_2m,weather_code,wind_speed_10m`,
    );
    const current = now?.current;
    if (!current) return 'The weather service didn’t answer.';
    const c = Math.round(current.temperature_2m);
    const f = Math.round(current.temperature_2m * 1.8 + 32);
    const sky = WEATHER_CODES[current.weather_code] ?? 'mixed weather';
    return `${spot.name}${spot.country ? `, ${spot.country}` : ''}: ${c}°C (${f}°F), ${sky}, wind ${Math.round(current.wind_speed_10m)} km/h`;
  });
}

export function timeIn(zone: string, now = new Date()): string {
  const tz = zone.trim() || 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      weekday: 'short',
      timeZoneName: 'short',
    }).format(now);
  } catch {
    return `“${tz}” isn’t a timezone (try America/New_York).`;
  }
}

// ── Math ────────────────────────────────────────────────────────────────────

/** A small, safe calculator: + - * / % ^, parentheses and a few functions. */
export function calculate(expression: string): string {
  const tokens = expression.replace(/\s+/g, '').match(/\d+(?:\.\d+)?|[a-z]+|[-+*/%^(),]/gi);
  if (!tokens || tokens.join('') !== expression.replace(/\s+/g, ''))
    return 'I can’t work that out.';
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const FUNCS: Record<string, (...n: number[]) => number> = {
    sqrt: Math.sqrt,
    abs: Math.abs,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    min: Math.min,
    max: Math.max,
    log: Math.log10,
    ln: Math.log,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
  };
  const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

  function expr(): number {
    let value = term();
    while (peek() === '+' || peek() === '-')
      value = next() === '+' ? value + term() : value - term();
    return value;
  }
  function term(): number {
    let value = power();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const rhs = power();
      value = op === '*' ? value * rhs : op === '/' ? value / rhs : value % rhs;
    }
    return value;
  }
  function power(): number {
    const base = unary();
    if (peek() === '^') {
      next();
      return base ** power();
    }
    return base;
  }
  function unary(): number {
    if (peek() === '-') {
      next();
      return -unary();
    }
    if (peek() === '+') {
      next();
      return unary();
    }
    return atom();
  }
  function atom(): number {
    const token = next();
    if (token === undefined) throw new Error('end');
    if (token === '(') {
      const value = expr();
      if (next() !== ')') throw new Error('paren');
      return value;
    }
    if (/^\d/.test(token)) return Number(token);
    const name = token.toLowerCase();
    if (name in CONSTS) return CONSTS[name] ?? 0;
    const fn = FUNCS[name];
    if (fn && next() === '(') {
      const args = [expr()];
      while (peek() === ',') {
        next();
        args.push(expr());
      }
      if (next() !== ')') throw new Error('paren');
      return fn(...args);
    }
    throw new Error('token');
  }

  try {
    const value = expr();
    if (i !== tokens.length || !Number.isFinite(value)) return 'I can’t work that out.';
    return String(Math.round(value * 1e8) / 1e8);
  } catch {
    return 'I can’t work that out.';
  }
}

// ── Custom API ──────────────────────────────────────────────────────────────

/** The text a URL returns (SSRF-guarded, small, single line). */
export async function customApi(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return 'customapi needs a web address.';
  try {
    const text = await safeFetchText(url, { maxBytes: 16_384, timeoutMs: 5000 });
    return clip(oneLine(text), 400);
  } catch {
    return 'That address didn’t answer.';
  }
}

// ── Emotes ──────────────────────────────────────────────────────────────────

export async function sevenTvEmotes(twitchId: string): Promise<string[]> {
  const value = await cached(`7tv:${twitchId}`, 600_000, async () => {
    const json = await getJson<{ emote_set?: { emotes?: { name: string }[] } }>(
      `https://7tv.io/v3/users/twitch/${twitchId}`,
    );
    return (json?.emote_set?.emotes ?? []).map((e) => e.name).join(' ');
  });
  return value ? value.split(' ') : [];
}

export async function bttvEmotes(twitchId: string): Promise<string[]> {
  const value = await cached(`bttv:${twitchId}`, 600_000, async () => {
    const json = await getJson<{
      channelEmotes?: { code: string }[];
      sharedEmotes?: { code: string }[];
    }>(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`);
    return [...(json?.channelEmotes ?? []), ...(json?.sharedEmotes ?? [])]
      .map((e) => e.code)
      .join(' ');
  });
  return value ? value.split(' ') : [];
}

export async function ffzEmotes(twitchId: string): Promise<string[]> {
  const value = await cached(`ffz:${twitchId}`, 600_000, async () => {
    const json = await getJson<{ sets?: Record<string, { emoticons?: { name: string }[] }> }>(
      `https://api.frankerfacez.com/v1/room/id/${twitchId}`,
    );
    return Object.values(json?.sets ?? {})
      .flatMap((set) => (set.emoticons ?? []).map((e) => e.name))
      .join(' ');
  });
  return value ? value.split(' ') : [];
}

export function emoteList(label: string, names: string[]): string {
  if (names.length === 0) return `No ${label} emotes.`;
  return clip(names.join(' '), 450);
}

// ── Latest posts ────────────────────────────────────────────────────────────

export async function latestYouTube(channelId: string): Promise<string> {
  if (!channelId) return 'No YouTube channel is set in Integrations.';
  return cached(`yt:${channelId}`, 600_000, async () => {
    const items = await fetchLatest('youtube', channelId, {});
    const item = items[0];
    return item ? clip(`${item.title} ${item.url}`) : 'No YouTube videos found.';
  });
}

export async function latestTikTok(user: string): Promise<string> {
  if (!user) return 'No TikTok account is set in Integrations.';
  return cached(`tt:${user}`, 600_000, async () => {
    const videos = await fetchTikTokVideos(user);
    const video = videos?.[0];
    if (!video) return videos ? 'No TikToks yet.' : 'TikTok didn’t answer.';
    const caption = video.description.split('\n')[0] ?? '';
    return clip(`${caption ? `${caption} ` : ''}${video.url}`);
  });
}

export async function latestMastodon(handle: string): Promise<string> {
  const match = handle.match(/^([\w.]+)@([\w.-]+\.\w+)$/);
  if (!match?.[1] || !match[2]) return 'No Mastodon account is set in Integrations.';
  const [, user, instance] = match;
  return cached(`masto:${handle}`, 600_000, async () => {
    const account = await getJson<{ id: string }>(
      `https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`,
    );
    if (!account?.id) return 'That Mastodon account wasn’t found.';
    const posts = await getJson<{ url: string; content: string }[]>(
      `https://${instance}/api/v1/accounts/${account.id}/statuses?limit=1&exclude_replies=true&exclude_reblogs=true`,
    );
    const post = posts?.[0];
    if (!post) return 'No Mastodon posts yet.';
    const text = oneLine(post.content.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' '));
    return clip(`${text} ${post.url}`);
  });
}

// ── Games & music ───────────────────────────────────────────────────────────

export async function lastFm(user: string): Promise<string> {
  const key = process.env.LASTFM_API_KEY;
  if (!key) return 'Last.fm isn’t set up (LASTFM_API_KEY).';
  if (!user) return 'No Last.fm user is set in Integrations.';
  return cached(`lastfm:${user}`, 30_000, async () => {
    const json = await getJson<{
      recenttracks?: {
        track?: { name: string; artist: { '#text': string }; '@attr'?: { nowplaying?: string } }[];
      };
    }>(
      `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(user)}&api_key=${key}&format=json&limit=1`,
    );
    const track = json?.recenttracks?.track?.[0];
    if (!track) return 'Nothing on Last.fm yet.';
    const playing = track['@attr']?.nowplaying === 'true';
    return `${playing ? 'Now playing' : 'Last played'}: ${track.artist['#text']} – ${track.name}`;
  });
}

const RIOT_REGIONAL: Record<string, string> = {
  na1: 'americas',
  br1: 'americas',
  la1: 'americas',
  la2: 'americas',
  euw1: 'europe',
  eun1: 'europe',
  tr1: 'europe',
  ru: 'europe',
  me1: 'europe',
  kr: 'asia',
  jp1: 'asia',
  oc1: 'sea',
  ph2: 'sea',
  sg2: 'sea',
  th2: 'sea',
  tw2: 'sea',
  vn2: 'sea',
};

async function riotPuuid(riotId: string, platform: string, key: string): Promise<string | null> {
  const [name, tag] = riotId.split('#');
  if (!name || !tag) return null;
  const regional = RIOT_REGIONAL[platform] ?? 'americas';
  const account = await getJson<{ puuid: string }>(
    `https://${regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
    { 'X-Riot-Token': key },
  );
  return account?.puuid ?? null;
}

interface RiotEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

function describeRank(entry: RiotEntry | undefined, riotId: string, unranked: string): string {
  if (!entry) return `${riotId} is ${unranked}.`;
  const tier = entry.tier.charAt(0) + entry.tier.slice(1).toLowerCase();
  const games = entry.wins + entry.losses;
  const rate = games > 0 ? Math.round((entry.wins / games) * 100) : 0;
  return `${riotId}: ${tier} ${entry.rank} ${entry.leaguePoints} LP (${entry.wins}W ${entry.losses}L, ${rate}%)`;
}

export async function leagueRank(riotId: string, platform: string): Promise<string> {
  const key = process.env.RIOT_API_KEY;
  if (!key) return 'League stats aren’t set up (RIOT_API_KEY).';
  if (!riotId) return 'No Riot ID is set in Integrations.';
  return cached(`lol:${riotId}:${platform}`, 120_000, async () => {
    const puuid = await riotPuuid(riotId, platform, key);
    if (!puuid) return `Riot doesn’t know ${riotId}.`;
    const entries = await getJson<RiotEntry[]>(
      `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`,
      { 'X-Riot-Token': key },
    );
    if (!entries) return 'Riot didn’t answer.';
    return describeRank(
      entries.find((e) => e.queueType === 'RANKED_SOLO_5x5'),
      riotId,
      'unranked in Solo/Duo',
    );
  });
}

export async function tftRank(riotId: string, platform: string): Promise<string> {
  const key = process.env.RIOT_API_KEY;
  if (!key) return 'TFT stats aren’t set up (RIOT_API_KEY).';
  if (!riotId) return 'No Riot ID is set in Integrations.';
  return cached(`tft:${riotId}:${platform}`, 120_000, async () => {
    const puuid = await riotPuuid(riotId, platform, key);
    if (!puuid) return `Riot doesn’t know ${riotId}.`;
    const entries = await getJson<RiotEntry[]>(
      `https://${platform}.api.riotgames.com/tft/league/v1/by-puuid/${puuid}`,
      { 'X-Riot-Token': key },
    );
    if (!entries) return 'Riot didn’t answer.';
    return describeRank(
      entries.find((e) => e.queueType === 'RANKED_TFT'),
      riotId,
      'unranked in TFT',
    );
  });
}

export async function valorantRank(riotId: string, region: string): Promise<string> {
  const key = process.env.HENRIKDEV_API_KEY;
  if (!key) return 'Valorant stats aren’t set up (HENRIKDEV_API_KEY).';
  const [name, tag] = riotId.split('#');
  if (!name || !tag) return 'No Riot ID is set in Integrations.';
  return cached(`val:${riotId}:${region}`, 120_000, async () => {
    const json = await getJson<{
      data?: { current_data?: { currenttierpatched?: string; ranking_in_tier?: number } };
    }>(
      `https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
      { Authorization: key },
    );
    const current = json?.data?.current_data;
    if (!current?.currenttierpatched) return `No Valorant rank for ${riotId}.`;
    return `${riotId}: ${current.currenttierpatched} (${current.ranking_in_tier ?? 0} RR)`;
  });
}
