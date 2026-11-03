import type { Module } from '../enums';

/**
 * Server templates — one-click Discord structure. Each template describes the
 * roles, categories/channels, and modules a server type wants. The bot
 * (apps/bot/src/modules/serverTemplate.ts) applies them additively: existing
 * roles/channels with the same name are left alone, and the listed modules are
 * switched on. Kept free of discord.js so both the bot and the dashboard
 * (preview) can import it — permissions are string keys the bot maps to
 * PermissionFlagsBits, colours are 0xRRGGBB ints.
 */

export type TemplateChannelType = 'text' | 'voice';

export interface TemplateChannel {
  name: string;
  type: TemplateChannelType;
  topic?: string;
}

export interface TemplateCategory {
  name: string;
  channels: TemplateChannel[];
}

/** Permission keys the bot maps to discord.js PermissionFlagsBits. */
export type TemplatePermission =
  | 'ManageMessages'
  | 'ModerateMembers'
  | 'KickMembers'
  | 'BanMembers'
  | 'ManageChannels'
  | 'ManageRoles'
  | 'ManageGuild'
  | 'MentionEveryone';

export interface TemplateRole {
  name: string;
  /** 0xRRGGBB; omit for the default (uncoloured) role. */
  color?: number;
  /** Show the role's members separately in the member list. */
  hoist?: boolean;
  permissions?: TemplatePermission[];
}

export interface ServerTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string;
  roles: TemplateRole[];
  categories: TemplateCategory[];
  /** Modules auto-enabled by the template. */
  modules: Module[];
}

const STAFF_PERMS: TemplatePermission[] = ['ManageMessages', 'ModerateMembers', 'KickMembers'];
const HELPER_PERMS: TemplatePermission[] = ['ManageMessages', 'ModerateMembers'];

export const SERVER_TEMPLATES: ServerTemplate[] = [
  {
    id: 'community',
    name: 'Community',
    emoji: '🏘️',
    description: 'A welcoming hub: rules, general chat, media, and voice lounges.',
    roles: [
      { name: 'Staff', color: 0x5865f2, hoist: true, permissions: STAFF_PERMS },
      { name: 'Member', color: 0x99aab5 },
    ],
    categories: [
      {
        name: 'Welcome',
        channels: [
          { name: 'rules', type: 'text', topic: 'Server rules — read before chatting.' },
          { name: 'announcements', type: 'text', topic: 'Official server announcements.' },
          { name: 'welcome', type: 'text', topic: 'Say hi to new members!' },
        ],
      },
      {
        name: 'Community',
        channels: [
          { name: 'general', type: 'text', topic: 'General chat.' },
          { name: 'media', type: 'text', topic: 'Share images, clips and links.' },
          { name: 'off-topic', type: 'text' },
          { name: 'bot-commands', type: 'text', topic: 'Use bot commands here.' },
        ],
      },
      {
        name: 'Voice Channels',
        channels: [
          { name: 'Lounge', type: 'voice' },
          { name: 'Music', type: 'voice' },
          { name: 'AFK', type: 'voice' },
        ],
      },
    ],
    modules: ['MODERATION', 'AUTOMOD', 'WELCOME', 'LEVELING', 'ROLES', 'STARBOARD', 'SUGGESTIONS'],
  },
  {
    id: 'support',
    name: 'Support / Help Desk',
    emoji: '🎫',
    description: 'Ticket-first: info, an open-a-ticket channel, and staff logs.',
    roles: [
      { name: 'Support Team', color: 0x2ecc71, hoist: true, permissions: HELPER_PERMS },
      { name: 'Customer', color: 0x99aab5 },
    ],
    categories: [
      {
        name: 'Information',
        channels: [
          { name: 'read-me', type: 'text', topic: 'Start here.' },
          { name: 'faq', type: 'text', topic: 'Frequently asked questions.' },
          { name: 'announcements', type: 'text' },
        ],
      },
      {
        name: 'Support',
        channels: [
          { name: 'open-a-ticket', type: 'text', topic: 'Open a ticket for help.' },
          { name: 'support-log', type: 'text', topic: 'Ticket + moderation logs.' },
        ],
      },
      { name: 'Community', channels: [{ name: 'general', type: 'text' }] },
    ],
    modules: ['TICKETS', 'APPLICATIONS', 'VERIFICATION', 'LOGGING', 'MODERATION'],
  },
  {
    id: 'gaming',
    name: 'Gaming',
    emoji: '🎮',
    description: 'LFG, clips and squad voice rooms with economy + leveling.',
    roles: [
      { name: 'Moderator', color: 0xe67e22, hoist: true, permissions: STAFF_PERMS },
      { name: 'Gamer', color: 0x9b59b6 },
    ],
    categories: [
      {
        name: 'Info',
        channels: [
          { name: 'rules', type: 'text' },
          { name: 'announcements', type: 'text' },
        ],
      },
      {
        name: 'General',
        channels: [
          { name: 'general', type: 'text' },
          { name: 'clips', type: 'text', topic: 'Show off your best plays.' },
          { name: 'looking-for-group', type: 'text', topic: 'Find teammates.' },
          { name: 'bot-commands', type: 'text' },
        ],
      },
      {
        name: 'Voice Channels',
        channels: [
          { name: 'Game Night', type: 'voice' },
          { name: 'Squad 1', type: 'voice' },
          { name: 'Squad 2', type: 'voice' },
          { name: 'AFK', type: 'voice' },
        ],
      },
    ],
    modules: ['MODERATION', 'AUTOMOD', 'LEVELING', 'TEMP_VOICE', 'ROLES'],
  },
  {
    id: 'creator',
    name: 'Content Creator',
    emoji: '🎥',
    description: 'Announcements, fan community and watch-party voice for an audience.',
    roles: [
      { name: 'Moderator', color: 0xe91e63, hoist: true, permissions: HELPER_PERMS },
      { name: 'Subscriber', color: 0xf1c40f, hoist: true },
      { name: 'Member', color: 0x99aab5 },
    ],
    categories: [
      {
        name: 'Announcements',
        channels: [
          { name: 'announcements', type: 'text' },
          { name: 'releases', type: 'text', topic: 'New uploads and drops.' },
          { name: 'schedule', type: 'text', topic: 'Upcoming streams and events.' },
        ],
      },
      {
        name: 'Community',
        channels: [
          { name: 'general', type: 'text' },
          { name: 'clips', type: 'text' },
          { name: 'fan-art', type: 'text' },
          { name: 'bot-commands', type: 'text' },
        ],
      },
      {
        name: 'Voice Channels',
        channels: [
          { name: 'Hangout', type: 'voice' },
          { name: 'Watch Party', type: 'voice' },
        ],
      },
    ],
    modules: ['WELCOME', 'LEVELING', 'ROLES', 'SOCIAL', 'MODERATION'],
  },
];

export const SERVER_TEMPLATE_IDS = SERVER_TEMPLATES.map((template) => template.id);

export function getServerTemplate(id: string): ServerTemplate | undefined {
  return SERVER_TEMPLATES.find((template) => template.id === id);
}

/** Total channels a template creates (categories count as channels in Discord). */
export function templateChannelCount(template: ServerTemplate): number {
  return template.categories.reduce((sum, cat) => sum + 1 + cat.channels.length, 0);
}
