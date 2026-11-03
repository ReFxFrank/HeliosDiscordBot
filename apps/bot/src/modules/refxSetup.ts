import { ChannelType, type Guild } from 'discord.js';
import type { Prisma } from '@refx/database';
import {
  DEFAULT_WELCOME_EMBED,
  REDIS_CHANNELS,
  parseModuleConfig,
  type ApplicationQuestion,
  type Module,
  type ModuleWithSchema,
  type RolePanelOption,
} from '@refx/shared';
import type { BotContext } from '../framework/context';

/**
 * `/refx-setup`: one pass that points every module at the ReFx Discord's
 * existing channels and roles, found by name (emoji and separators ignored, so
 * "🛫｜arrivals" matches "arrivals"). It only writes config and creates the
 * application forms / role panel rows that don't exist yet — it never posts
 * panels or touches channels and roles, so it is safe to re-run. Anything it
 * can't find is reported and left unset.
 */

/** Lowercase letters/digits only: "🛫｜arrivals" → "arrivals". */
const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

// DNS-only A record for the city; members see this, never the raw IP.
const FIVEM_HOST = 'play.refx.gg';

interface Found {
  channels: Map<string, string>;
  categories: Map<string, string>;
  roles: Map<string, string>;
  missing: Set<string>;
}

function lookup(found: Found) {
  const channel = (name: string) => {
    const id = found.channels.get(key(name));
    if (!id) found.missing.add(`#${name}`);
    return id ?? null;
  };
  const category = (name: string) => {
    const id = found.categories.get(key(name));
    if (!id) found.missing.add(`category ${name}`);
    return id ?? null;
  };
  const role = (name: string) => {
    const id = found.roles.get(key(name));
    if (!id) found.missing.add(`@${name}`);
    return id ?? null;
  };
  /** First role that exists out of several candidate names. */
  const anyRole = (...names: string[]) => {
    for (const name of names) {
      const id = found.roles.get(key(name));
      if (id) return id;
    }
    found.missing.add(`@${names.join(' / @')}`);
    return null;
  };
  return { channel, category, role, anyRole };
}

const ids = (...values: (string | null)[]) => values.filter((v): v is string => Boolean(v));

const q = (
  id: string,
  label: string,
  style: ApplicationQuestion['style'] = 'paragraph',
  placeholder?: string,
): ApplicationQuestion => ({ id, label, style, required: true, placeholder });

/** ReFx's application forms (replacing Appy), one review channel each. */
const FORMS: {
  name: string;
  description: string;
  review: string;
  questions: ApplicationQuestion[];
}[] = [
  {
    name: 'Staff Application',
    description: 'Help run the city and the Discord.',
    review: 'staff-apps',
    questions: [
      q('name', 'What is your name?', 'short'),
      q('age', 'How old are you?', 'short'),
      q('timezone', 'What is your time zone?', 'short', 'e.g. EST, PST, GMT'),
      q('why', 'Why do you want to join the ReFx Staff Team?'),
      q('position', 'What position(s) are you applying for?'),
    ],
  },
  {
    name: 'Business Application',
    description: 'Open or take over a business in the city.',
    review: 'business-apps',
    questions: [
      q('business', 'Business name and type', 'short'),
      q('owner', 'Owner character name and phone number', 'short'),
      q('concept', 'What will the business offer the city?'),
      q('staffing', 'Who will staff it, and when are you active?'),
      q('why', 'Why should we approve it?'),
    ],
  },
  {
    name: 'Faction Application',
    description: 'Start a gang, crew or organisation.',
    review: 'faction-apps',
    questions: [
      q('faction', 'Faction name', 'short'),
      q('leader', 'Leader character name', 'short'),
      q('members', 'Members (character names) and size'),
      q('concept', 'Faction concept, history and goals'),
      q('rp', 'How will your faction create RP for others?'),
    ],
  },
  {
    name: 'Developer Application',
    description: 'Build for the ReFx framework.',
    review: 'dev-apps',
    questions: [
      q('name', 'Name, age and time zone', 'short'),
      q('experience', 'Experience (Lua, JS/TS, FiveM, MongoDB...)'),
      q('portfolio', 'Portfolio or GitHub links'),
      q('focus', 'What would you like to work on?'),
      q('hours', 'How many hours a week can you give?', 'short'),
    ],
  },
  {
    name: 'Content Creator Application',
    description: 'Stream or make videos in the city.',
    review: 'cc-apps',
    questions: [
      q('name', 'Name and age', 'short'),
      q('channel', 'Platform and channel link', 'short'),
      q('audience', 'Followers and average viewers', 'short'),
      q('schedule', 'Your streaming or upload schedule'),
      q('why', 'Why do you want to create for ReFx?'),
    ],
  },
];

export interface RefxSetupResult {
  modules: Module[];
  formsCreated: string[];
  rolePanelCreated: boolean;
  missing: string[];
}

export async function runRefxSetup(
  guild: Guild,
  actorId: string,
  ctx: Pick<BotContext, 'prisma' | 'redis' | 'logger'>,
): Promise<RefxSetupResult> {
  const channels = await guild.channels.fetch();
  const roles = await guild.roles.fetch();
  const found: Found = {
    channels: new Map(),
    categories: new Map(),
    roles: new Map(),
    missing: new Set(),
  };
  for (const channel of channels.values()) {
    if (!channel) continue;
    const target = channel.type === ChannelType.GuildCategory ? found.categories : found.channels;
    if (!target.has(key(channel.name))) target.set(key(channel.name), channel.id);
  }
  for (const role of roles.values()) {
    if (!role.managed && !found.roles.has(key(role.name))) found.roles.set(key(role.name), role.id);
  }
  const { channel, category, role, anyRole } = lookup(found);

  const adminTeam = role('Admin Team');
  const staffTeam = role('Staff Team');
  const staffManager = role('Staff Manager');
  const founder = role('Founder');
  const member = anyRole('Member', 'Verified', 'Citizen');
  const rules = channel('rules');
  const verify = channel('verify');

  const mention = (id: string | null, fallback: string, kind: '#' | '@&') =>
    id ? `<${kind}${id}>` : fallback;
  const welcomeDescription =
    'Welcome {user}\n\n' +
    `Feel free to have a look around, if you have any questions, please feel free to message a ${mention(adminTeam, 'Admin Team', '@&')} member or a ${mention(staffTeam, 'Staff Team', '@&')} member for assistance!\n\n` +
    `Please head over to ${mention(rules, '#rules', '#')} to review the city and community rules. Afterwards you may apply in ${mention(verify, '#verify', '#')} for your membership role! After acceptance, you will gain access to the rest of the community channels.\n\n` +
    'Hope to see you out on the streets!';

  const updates: Partial<Record<ModuleWithSchema, Record<string, unknown>>> = {
    WELCOME: {
      channelId: channel('arrivals'),
      message: '',
      embedEnabled: true,
      embed: { ...DEFAULT_WELCOME_EMBED, description: welcomeDescription },
      thumbnail: 'server',
      boostChannelId: channel('boosts'),
    },
    LOGGING: {
      memberChannelId: channel('leave-and-join-logs'),
      messageChannelId: channel('discord-logs'),
      serverChannelId: channel('discord-logs'),
      voiceChannelId: channel('discord-logs'),
    },
    INVITE_TRACKING: { logChannelId: channel('invite-logs') },
    VERIFICATION: {
      method: 'button',
      verifiedRoleId: member ?? '',
      panelChannelId: verify,
      panelTitle: 'ReFx Verification',
      panelMessage: 'Please click the button to gain access to the discord!',
      buttonLabel: 'Start Verification',
      logChannelId: channel('discord-logs'),
      minAccountAgeHours: 24,
    },
    TICKETS: {
      categoryId: category('ReFx | Support'),
      supportRoleIds: ids(adminTeam, staffTeam),
      transcriptChannelId: channel('ticket-logs'),
      panelChannelId: channel('tickets'),
      panelTitle: 'ReFx Support',
      panelDescription:
        'Need help with something in the city or the Discord? Open a private ticket and a member of staff will be with you shortly.',
      buttonLabel: 'Open a ticket',
    },
    APPLICATIONS: { staffRoleIds: ids(adminTeam, staffManager, founder) },
    LEVELING: { announce: 'CHANNEL', announceChannelId: channel('levels') },
    MODERATION: { modRoleIds: ids(staffTeam), adminRoleIds: ids(adminTeam, founder) },
    FIVEM: {
      serverName: 'ReFx Roleplay',
      host: FIVEM_HOST,
      connectAddress: FIVEM_HOST,
      port: 30_120,
      panelChannelId: channel('connect'),
      alertsChannelId: channel('server-status'),
      whitelistRoleIds: ids(member),
      // Stays off until the refx_whitelist resource is installed on the server.
      whitelistEnabled: false,
    },
  };

  const result: RefxSetupResult = {
    modules: [],
    formsCreated: [],
    rolePanelCreated: false,
    missing: [],
  };

  for (const [module, patch] of Object.entries(updates) as [
    ModuleWithSchema,
    Record<string, unknown>,
  ][]) {
    const existing = await ctx.prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: guild.id, module } },
    });
    const current = (existing?.config ?? {}) as Record<string, unknown>;
    // Validate the merged result so a bad patch can never land in the DB.
    const config = parseModuleConfig(module, { ...current, ...patch }) as Prisma.InputJsonValue;
    await ctx.prisma.guildModuleConfig.upsert({
      where: { guildId_module: { guildId: guild.id, module } },
      update: { enabled: true, config, updatedBy: actorId },
      create: { guildId: guild.id, module, enabled: true, config, updatedBy: actorId },
    });
    await ctx.redis.publish(
      REDIS_CHANNELS.configUpdate,
      JSON.stringify({ guildId: guild.id, module }),
    );
    result.modules.push(module);
  }
  // Modules with no config of their own that ReFx uses.
  for (const module of ['ROLES', 'UTILITY'] as const) {
    await ctx.prisma.guildModuleConfig.upsert({
      where: { guildId_module: { guildId: guild.id, module } },
      update: { enabled: true, updatedBy: actorId },
      create: { guildId: guild.id, module, enabled: true, updatedBy: actorId },
    });
    await ctx.redis.publish(
      REDIS_CHANNELS.configUpdate,
      JSON.stringify({ guildId: guild.id, module }),
    );
    result.modules.push(module);
  }

  const existingForms = new Set(
    (
      await ctx.prisma.applicationForm.findMany({
        where: { guildId: guild.id },
        select: { name: true },
      })
    ).map((form) => key(form.name)),
  );
  for (const form of FORMS) {
    if (existingForms.has(key(form.name))) continue;
    await ctx.prisma.applicationForm.create({
      data: {
        guildId: guild.id,
        name: form.name,
        description: form.description,
        questions: form.questions as unknown as Prisma.InputJsonValue,
        reviewChannelId: channel(form.review),
      },
    });
    result.formsCreated.push(form.name);
  }

  const options: RolePanelOption[] = [];
  const contentFollower = role('Content Follower');
  const socialUpdates = role('Social Updates');
  if (contentFollower) {
    options.push({
      roleId: contentFollower,
      label: 'Content Follower',
      emoji: '🎥',
      description: 'New videos, streams and creator content',
    });
  }
  if (socialUpdates) {
    options.push({
      roleId: socialUpdates,
      label: 'Social Updates',
      emoji: '📣',
      description: 'Posts, announcements and media drops',
    });
  }
  const panelTitle = 'Choose Your Notification Roles';
  if (
    options.length > 0 &&
    !(await ctx.prisma.reactionRolePanel.findFirst({
      where: { guildId: guild.id, title: panelTitle },
    }))
  ) {
    await ctx.prisma.reactionRolePanel.create({
      data: {
        guildId: guild.id,
        channelId: channel('roles'),
        title: panelTitle,
        description:
          'Stay up to date with the latest from ReFx! Click the buttons below to add or remove these roles.',
        mode: 'NORMAL',
        type: 'BUTTON',
        options: options as unknown as Prisma.InputJsonValue,
      },
    });
    result.rolePanelCreated = true;
  }

  result.missing = [...found.missing];
  ctx.logger.info({ guildId: guild.id, actorId, ...result }, 'ReFx setup applied');
  return result;
}
