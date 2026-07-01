import type { Module } from '@solari/shared';
import {
  ShieldAlert,
  ShieldBan,
  ScrollText,
  DoorOpen,
  UserPlus,
  TrendingUp,
  Tags,
  MessageSquareCode,
  Star,
  Gift,
  Vote,
  Lightbulb,
  Clock,
  CalendarClock,
  Ticket,
  BarChart3,
  Link2,
  Cake,
  Moon,
  Coins,
  Music,
  Bell,
  Mic,
  ServerCog,
  Wrench,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

export type ModuleCategory = 'core' | 'premium' | 'utility';

/**
 * Decorative icon-tile gradients, keyed by name. These category-code the module
 * grid (like MEE6's colorful plugin tiles) and are intentionally separate from
 * the brand violet — the brand color stays reserved for interactive/premium UI.
 * `[from, to]` are applied as an inline `linear-gradient` so Tailwind's JIT never
 * needs to see the runtime hex values.
 */
export const MODULE_ACCENTS = {
  violet: ['#8b5cf6', '#6d28d9'],
  fuchsia: ['#d946ef', '#a21caf'],
  pink: ['#ec4899', '#be185d'],
  indigo: ['#6366f1', '#4338ca'],
  sky: ['#0ea5e9', '#0369a1'],
  cyan: ['#06b6d4', '#0e7490'],
  teal: ['#14b8a6', '#0f766e'],
  emerald: ['#10b981', '#047857'],
  amber: ['#f59e0b', '#b45309'],
  orange: ['#f97316', '#c2410c'],
  rose: ['#f43f5e', '#be123c'],
  red: ['#ef4444', '#b91c1c'],
  slate: ['#64748b', '#334155'],
  gold: ['#f5c451', '#cf9e2f'],
} as const;

export type ModuleAccent = keyof typeof MODULE_ACCENTS;

export interface ModuleMeta {
  module: Module;
  name: string;
  description: string;
  icon: LucideIcon;
  category: ModuleCategory;
  /** Icon-tile gradient key (see MODULE_ACCENTS). */
  accent: ModuleAccent;
  /** Slug of a dedicated config page under /servers/[id]/<slug>, if any. */
  configSlug?: string;
}

export const MODULE_META: ModuleMeta[] = [
  {
    module: 'MODERATION',
    name: 'Moderation',
    description: 'Cases, warns, bans, mutes, escalation.',
    icon: ShieldAlert,
    category: 'core',
    accent: 'red',
    configSlug: 'moderation',
  },
  {
    module: 'AUTOMOD',
    name: 'Auto-moderation',
    description: 'Spam, links, invites, bad-word filters.',
    icon: ShieldBan,
    category: 'core',
    accent: 'rose',
    configSlug: 'automod',
  },
  {
    module: 'LOGGING',
    name: 'Logging',
    description: 'Message, member, server & voice logs.',
    icon: ScrollText,
    category: 'core',
    accent: 'indigo',
    configSlug: 'logging',
  },
  {
    module: 'WELCOME',
    name: 'Welcome / Leave',
    description: 'Greetings, goodbyes, and welcome cards.',
    icon: DoorOpen,
    category: 'core',
    accent: 'emerald',
    configSlug: 'welcome',
  },
  {
    module: 'AUTOROLE',
    name: 'Autoroles',
    description: 'Roles on join, sticky & timed roles.',
    icon: UserPlus,
    category: 'core',
    accent: 'sky',
    configSlug: 'autoroles',
  },
  {
    module: 'LEVELING',
    name: 'Leveling / XP',
    description: 'Text & voice XP, rank cards, rewards.',
    icon: TrendingUp,
    category: 'core',
    accent: 'amber',
    configSlug: 'leveling',
  },
  {
    module: 'ROLES',
    name: 'Reaction Roles',
    description: 'Button & select-menu role panels.',
    icon: Tags,
    category: 'core',
    accent: 'fuchsia',
    configSlug: 'roles',
  },
  {
    module: 'CUSTOM_COMMANDS',
    name: 'Custom Commands',
    description: 'Tags, auto-responders, embed builder.',
    icon: MessageSquareCode,
    category: 'core',
    accent: 'violet',
    configSlug: 'commands',
  },
  {
    module: 'STARBOARD',
    name: 'Starboard',
    description: 'Highlight the best messages.',
    icon: Star,
    category: 'core',
    accent: 'orange',
    configSlug: 'starboard',
  },
  {
    module: 'GIVEAWAYS',
    name: 'Giveaways',
    description: 'Timed draws with requirements & reroll.',
    icon: Gift,
    category: 'core',
    accent: 'pink',
    configSlug: 'giveaways',
  },
  {
    module: 'POLLS',
    name: 'Polls',
    description: 'Single/multi, timed, anonymous polls.',
    icon: Vote,
    category: 'core',
    accent: 'teal',
    configSlug: 'polls',
  },
  {
    module: 'SUGGESTIONS',
    name: 'Suggestions',
    description: 'Submit, vote, and triage suggestions.',
    icon: Lightbulb,
    category: 'core',
    accent: 'amber',
    configSlug: 'suggestions',
  },
  {
    module: 'REMINDERS',
    name: 'Reminders',
    description: 'Personal & server reminders.',
    icon: Clock,
    category: 'core',
    accent: 'sky',
  },
  {
    module: 'SCHEDULED_MESSAGES',
    name: 'Scheduled Messages',
    description: 'Cron / recurring announcements.',
    icon: CalendarClock,
    category: 'core',
    accent: 'indigo',
    configSlug: 'scheduled',
  },
  {
    module: 'TICKETS',
    name: 'Tickets',
    description: 'Support panels, transcripts, auto-close.',
    icon: Ticket,
    category: 'core',
    accent: 'violet',
    configSlug: 'tickets',
  },
  {
    module: 'STATS_COUNTERS',
    name: 'Stats Counters',
    description: 'Auto-updating member/online channels.',
    icon: BarChart3,
    category: 'core',
    accent: 'cyan',
    configSlug: 'stats',
  },
  {
    module: 'INVITE_TRACKING',
    name: 'Invite Tracking',
    description: 'Who invited whom + leaderboard.',
    icon: Link2,
    category: 'core',
    accent: 'emerald',
    configSlug: 'invites',
  },
  {
    module: 'BIRTHDAYS',
    name: 'Birthdays',
    description: 'Announcements and a birthday role.',
    icon: Cake,
    category: 'core',
    accent: 'pink',
    configSlug: 'birthdays',
  },
  {
    module: 'AFK',
    name: 'AFK',
    description: 'Away status with auto-replies.',
    icon: Moon,
    category: 'core',
    accent: 'slate',
  },
  {
    module: 'ACHIEVEMENTS',
    name: 'Achievements',
    description: 'Milestone rewards for level, messages, coins, and voice time.',
    icon: Trophy,
    category: 'core',
    accent: 'gold',
    configSlug: 'achievements',
  },
  {
    module: 'ECONOMY',
    name: 'Economy',
    description: 'Currency, games, shop & inventory.',
    icon: Coins,
    category: 'premium',
    accent: 'amber',
    configSlug: 'economy',
  },
  {
    module: 'MUSIC',
    name: 'Music',
    description: 'Queue, filters, DJ roles, vote-skip.',
    icon: Music,
    category: 'premium',
    accent: 'fuchsia',
    configSlug: 'music',
  },
  {
    module: 'SOCIAL',
    name: 'Social Alerts',
    description: 'Twitch, YouTube, Reddit & RSS feeds.',
    icon: Bell,
    category: 'premium',
    accent: 'sky',
  },
  {
    module: 'TEMP_VOICE',
    name: 'Temp Voice',
    description: 'Join-to-create voice channels.',
    icon: Mic,
    category: 'premium',
    accent: 'teal',
    configSlug: 'temp-voice',
  },
  {
    module: 'REFX_ALERTS',
    name: 'ReFx Alerts',
    description: 'Live ReFx Hosting incident & node alerts.',
    icon: ServerCog,
    category: 'premium',
    accent: 'indigo',
    configSlug: 'refx-alerts',
  },
  {
    module: 'UTILITY',
    name: 'Utility',
    description: 'userinfo, serverinfo, announcements.',
    icon: Wrench,
    category: 'utility',
    accent: 'slate',
  },
  {
    module: 'FUN',
    name: 'Fun',
    description: '8ball, trivia, memes, and more.',
    icon: Sparkles,
    category: 'utility',
    accent: 'violet',
  },
];

export const MODULE_META_BY_KEY: Record<Module, ModuleMeta> = Object.fromEntries(
  MODULE_META.map((meta) => [meta.module, meta]),
) as Record<Module, ModuleMeta>;

/** The module owning a config-page slug (e.g. "leveling" → "LEVELING"), if any. */
export function moduleBySlug(slug: string): Module | null {
  return MODULE_META.find((meta) => meta.configSlug === slug)?.module ?? null;
}

// ── MEE6-style grouping (sidebar sections + categorized plugin grid) ──────────

export const MODULE_GROUPS = [
  'Essentials',
  'Server Management',
  'Utilities',
  'Social Alerts',
  'Games & Fun',
] as const;
export type ModuleGroup = (typeof MODULE_GROUPS)[number];

const GROUP_BY_MODULE: Partial<Record<Module, ModuleGroup>> = {
  MODERATION: 'Essentials',
  AUTOMOD: 'Essentials',
  LOGGING: 'Essentials',
  WELCOME: 'Essentials',
  AUTOROLE: 'Essentials',
  LEVELING: 'Essentials',
  ACHIEVEMENTS: 'Essentials',
  ROLES: 'Essentials',
  STARBOARD: 'Essentials',
  CUSTOM_COMMANDS: 'Server Management',
  INVITE_TRACKING: 'Server Management',
  TICKETS: 'Server Management',
  POLLS: 'Utilities',
  REMINDERS: 'Utilities',
  SCHEDULED_MESSAGES: 'Utilities',
  STATS_COUNTERS: 'Utilities',
  TEMP_VOICE: 'Utilities',
  SUGGESTIONS: 'Utilities',
  AFK: 'Utilities',
  SOCIAL: 'Social Alerts',
  REFX_ALERTS: 'Social Alerts',
  GIVEAWAYS: 'Games & Fun',
  BIRTHDAYS: 'Games & Fun',
  ECONOMY: 'Games & Fun',
  MUSIC: 'Games & Fun',
};

export function moduleGroup(module: Module): ModuleGroup {
  return GROUP_BY_MODULE[module] ?? 'Utilities';
}

/**
 * MODULE_META split into MEE6-style groups, in group order, each group keeping
 * MODULE_META order. Only groups with at least one module are returned.
 */
export function groupedModuleMeta(): { group: ModuleGroup; modules: ModuleMeta[] }[] {
  return MODULE_GROUPS.map((group) => ({
    group,
    modules: MODULE_META.filter((meta) => meta.configSlug && moduleGroup(meta.module) === group),
  })).filter((entry) => entry.modules.length > 0);
}
