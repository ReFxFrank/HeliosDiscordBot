import { FEATURES, type Module } from '@refx/shared';
import { MODULE_META } from './modules';

/**
 * Quick-setup bundles for the first-run wizard. Each preset enables a curated
 * set of modules with the bot's own sensible defaults (Tickets even
 * auto-configures its channels).
 */
export interface SetupPreset {
  key: string;
  name: string;
  tagline: string;
  /** lucide icon name, resolved in the client component. */
  icon: 'Users' | 'Gamepad2' | 'LifeBuoy' | 'Sparkles' | 'Radio';
  modules: Module[];
}

const ALL_PRESETS: SetupPreset[] = [
  {
    key: 'stream',
    name: 'Stream Community',
    tagline: 'Go-live alerts, welcomes, levels, reaction roles, giveaways, moderation & logging.',
    icon: 'Radio',
    modules: [
      'SOCIAL',
      'WELCOME',
      'LEVELING',
      'ROLES',
      'GIVEAWAYS',
      'MODERATION',
      'AUTOMOD',
      'LOGGING',
    ],
  },
  {
    key: 'city',
    name: 'RP City',
    tagline: 'FiveM status panel, verification, welcomes, tickets, applications & logging.',
    icon: 'Gamepad2',
    modules: [
      'FIVEM',
      'VERIFICATION',
      'WELCOME',
      'TICKETS',
      'APPLICATIONS',
      'MODERATION',
      'LOGGING',
    ],
  },
  {
    key: 'community',
    name: 'Community',
    tagline: 'Moderation, auto-mod, welcomes, levels, reaction roles, starboard & logging.',
    icon: 'Users',
    modules: ['MODERATION', 'AUTOMOD', 'WELCOME', 'LEVELING', 'ROLES', 'STARBOARD', 'LOGGING'],
  },
  {
    key: 'support',
    name: 'Support',
    tagline: 'Verification, tickets, applications, logging & autoroles for a help server.',
    icon: 'LifeBuoy',
    modules: ['MODERATION', 'VERIFICATION', 'TICKETS', 'APPLICATIONS', 'LOGGING', 'AUTOROLE'],
  },
  {
    key: 'everything',
    name: 'Everything',
    tagline: 'Turn on every module and trim later.',
    icon: 'Sparkles',
    modules: MODULE_META.map((m) => m.module),
  },
];

/** Presets this instance offers; a FiveM instance leads with the city one. */
export const SETUP_PRESETS: SetupPreset[] = FEATURES.fivem
  ? [...ALL_PRESETS].sort((a, b) => Number(b.key === 'city') - Number(a.key === 'city'))
  : ALL_PRESETS.filter((preset) => preset.key !== 'city');

export function setupPreset(key: string): SetupPreset | null {
  return SETUP_PRESETS.find((preset) => preset.key === key) ?? null;
}
