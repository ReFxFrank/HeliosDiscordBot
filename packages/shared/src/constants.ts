/**
 * Brand + design tokens shared between the bot (embeds) and the dashboard.
 *
 * One codebase runs several instances (ReFx Assistant, Professor Hopps, ...),
 * each with its own Discord app, database and `.env`. An instance is branded
 * by env vars; the ReFx values are the defaults. The dashboard reads the
 * `NEXT_PUBLIC_*` twins, which compose passes at build time so they are
 * inlined into the client bundle (every reference must stay a literal
 * `process.env.NAME` for that to work).
 */

const text = (value: string | undefined, fallback: string): string => value?.trim() || fallback;

const colorHex = text(
  process.env.NEXT_PUBLIC_BRAND_COLOR || process.env.BRAND_COLOR,
  '#0072ff',
).toLowerCase();
const validHex = /^#[0-9a-f]{6}$/.test(colorHex) ? colorHex : '#0072ff';

const community = text(
  process.env.NEXT_PUBLIC_BRAND_COMMUNITY || process.env.BRAND_COMMUNITY,
  'ReFx Roleplay',
);

const logoPath = text(
  process.env.NEXT_PUBLIC_BRAND_LOGO || process.env.BRAND_LOGO,
  '/refx-logo.png',
);

export const BRAND = {
  /** Persona shown as the embed author. */
  name: text(process.env.NEXT_PUBLIC_BRAND_NAME || process.env.BRAND_NAME, 'ReFx Assistant'),
  /** Community name. */
  community,
  /** Accent colour as an integer (embeds) and as `#rrggbb` (dashboard, cards). */
  color: Number.parseInt(validHex.slice(1), 16),
  colorHex: validHex,
  footer: text(process.env.NEXT_PUBLIC_BRAND_FOOTER || process.env.BRAND_FOOTER, community),
  /** Logo path under the dashboard's /public, or '' for a letter tile (BRAND_LOGO=none). */
  logo: logoPath === 'none' ? '' : logoPath,
} as const;

/** Whether this instance is the default ReFx one (default colours, no overrides). */
export const IS_DEFAULT_BRAND = validHex === '#0072ff';

/**
 * Per-instance feature switches. `FEATURE_FIVEM=false` hides everything tied to
 * a FiveM city (module, commands, dashboard page, whitelist API) for instances
 * that serve an ordinary community.
 */
export const FEATURES = {
  fivem:
    (process.env.NEXT_PUBLIC_FEATURE_FIVEM || process.env.FEATURE_FIVEM || 'true')
      .trim()
      .toLowerCase() !== 'false',
} as const;

/** Semantic colors as integers for discord.js embeds. */
export const COLORS = {
  brand: BRAND.color,
  success: 0x10b981,
  warning: 0xf59e0b,
  danger: 0xf43f5e,
  info: 0x38bdf8,
} as const;

/** Discord platform limits worth enforcing in shared code. */
export const DISCORD_LIMITS = {
  customIdMaxLength: 100,
  embedDescriptionMaxLength: 4096,
  messageMaxLength: 2000,
  selectMenuMaxOptions: 25,
} as const;
