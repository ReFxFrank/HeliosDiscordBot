import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Wiki registry (wiki.solari.gg / /docs). Pages are markdown files under
 * apps/web/content/wiki/<slug>.md, organized into MEE6-style sections. The
 * web Docker image ships the full app dir (non-standalone `next start`), so
 * reading them from the filesystem at request time is safe in production.
 */

export interface WikiPage {
  slug: string;
  title: string;
  description: string;
}

export interface WikiSection {
  title: string;
  pages: WikiPage[];
}

export const WIKI_SECTIONS: WikiSection[] = [
  {
    title: 'Getting Started',
    pages: [
      { slug: 'introduction', title: 'Introduction', description: 'What Solari is and what it can do.' },
      { slug: 'getting-started', title: 'Getting Started', description: 'Invite the bot and set up your first modules.' },
      { slug: 'dashboard', title: 'The Dashboard', description: 'How the web dashboard is organized.' },
      { slug: 'faq', title: 'FAQ', description: 'Frequently asked questions.' },
    ],
  },
  {
    title: 'Essentials',
    pages: [
      { slug: 'moderation', title: 'Moderation', description: 'Warns, kicks, bans, cases, and escalation.' },
      { slug: 'automod', title: 'Auto-Moderation', description: 'Filters, raid protection, and exemptions.' },
      { slug: 'verification', title: 'Verification', description: 'Button and captcha gates for new members.' },
      { slug: 'logging', title: 'Logging', description: 'Message, member, server, and voice logs.' },
      { slug: 'welcome', title: 'Welcome & Goodbye', description: 'Greetings, welcome cards, and leave messages.' },
      { slug: 'autoroles', title: 'Autoroles', description: 'Roles applied automatically on join.' },
      { slug: 'leveling', title: 'Leveling & XP', description: 'Text/voice XP, rank cards, role rewards.' },
      { slug: 'achievements', title: 'Achievements', description: 'Tiered milestones with rewards.' },
      { slug: 'reaction-roles', title: 'Reaction Roles', description: 'Button and select-menu role panels.' },
      { slug: 'starboard', title: 'Starboard', description: 'Highlight the best messages.' },
    ],
  },
  {
    title: 'Server Management',
    pages: [
      { slug: 'custom-commands', title: 'Custom Commands', description: 'Tags, auto-responders, and embeds.' },
      { slug: 'invite-tracking', title: 'Invite Tracking', description: 'Who invited whom.' },
      { slug: 'tickets', title: 'Tickets', description: 'Private support channels with transcripts.' },
      { slug: 'slash-commands', title: 'Command Toggles', description: 'Enable or disable individual commands.' },
      { slug: 'bot-personalizer', title: 'Bot Personalizer', description: 'Run Solari under your own bot identity.' },
    ],
  },
  {
    title: 'Utilities',
    pages: [
      { slug: 'polls', title: 'Polls', description: 'Button-vote polls with live results.' },
      { slug: 'reminders', title: 'Reminders', description: 'Personal reminders with /remind.' },
      { slug: 'scheduled-messages', title: 'Scheduled Messages', description: 'One-off and recurring announcements.' },
      { slug: 'stats-counters', title: 'Stats Counters', description: 'Auto-updating member-count channels.' },
      { slug: 'temp-voice', title: 'Temp Voice', description: 'Join-to-create voice channels.' },
      { slug: 'suggestions', title: 'Suggestions', description: 'Collect and triage member ideas.' },
      { slug: 'afk', title: 'AFK', description: 'Away status with auto-replies.' },
    ],
  },
  {
    title: 'Social Alerts',
    pages: [
      { slug: 'social-alerts', title: 'Social Alerts', description: 'Twitch, YouTube, Reddit, Bluesky & RSS.' },
      { slug: 'refx-alerts', title: 'ReFx Alerts', description: 'Live ReFx Hosting incident alerts.' },
    ],
  },
  {
    title: 'Games & Fun',
    pages: [
      { slug: 'giveaways', title: 'Giveaways', description: 'Timed draws with requirements and rerolls.' },
      { slug: 'birthdays', title: 'Birthdays', description: 'Announcements and a birthday role.' },
      { slug: 'economy', title: 'Economy', description: 'Currency, income, rob, and the shop.' },
      { slug: 'casino', title: 'Casino', description: 'Blackjack, roulette, slots, dice, coinflip.' },
      { slug: 'music', title: 'Music', description: 'Queue-based music playback.' },
    ],
  },
  {
    title: 'Premium',
    pages: [{ slug: 'premium', title: 'Solari Premium', description: 'What Premium unlocks and how billing works.' }],
  },
];

const ALL_PAGES: WikiPage[] = WIKI_SECTIONS.flatMap((section) => section.pages);

export function wikiPage(slug: string): WikiPage | null {
  return ALL_PAGES.find((page) => page.slug === slug) ?? null;
}

export function wikiSectionOf(slug: string): WikiSection | null {
  return WIKI_SECTIONS.find((section) => section.pages.some((p) => p.slug === slug)) ?? null;
}

/** Previous/next pages in reading order (for the footer pager). */
export function wikiNeighbors(slug: string): { prev: WikiPage | null; next: WikiPage | null } {
  const index = ALL_PAGES.findIndex((page) => page.slug === slug);
  if (index === -1) return { prev: null, next: null };
  return { prev: ALL_PAGES[index - 1] ?? null, next: ALL_PAGES[index + 1] ?? null };
}

/** Load a page's markdown source, or null when the slug is unknown. */
export async function wikiContent(slug: string): Promise<string | null> {
  if (!wikiPage(slug)) return null; // registry is the allowlist — no path traversal
  const file = path.join(process.cwd(), 'content', 'wiki', `${slug}.md`);
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}
