import { z } from 'zod';
import { embedSpecSchema } from '../embed';

export const WELCOME_THUMBNAILS = ['server', 'user', 'custom', 'none'] as const;
export type WelcomeThumbnail = (typeof WELCOME_THUMBNAILS)[number];

/**
 * Default welcome embed, modelled on the one ReFx used before (MEE6): a blue
 * "Welcome!" card pointing new members at the rules and verification. Channel
 * and role mentions are filled in by `/refx-setup` once it knows the guild.
 */
export const DEFAULT_WELCOME_EMBED = {
  author: { name: 'ReFx Assistant' },
  title: 'Welcome!',
  description:
    'Welcome {user}\n\n' +
    'Feel free to have a look around, if you have any questions, please feel free to message a member of the Admin or Staff Team for assistance!\n\n' +
    'Please head over to the rules channel to review the city and community rules. Then answer the quick join questions to unlock the rest of the community, or hit Start Verification in the verify channel.\n\n' +
    'Hope to see you out on the streets!',
  color: '#70B0FF',
  footer: 'ReFx Roleplay',
} satisfies z.input<typeof embedSpecSchema>;

export const welcomeConfigSchema = z.object({
  channelId: z.string().nullable().default(null),
  /** Plain message sent with the welcome (above the embed). May be empty when the embed is on. */
  message: z.string().default(''),
  /** Send `embed` with the welcome. */
  embedEnabled: z.boolean().default(true),
  embed: embedSpecSchema.default(DEFAULT_WELCOME_EMBED),
  /** Where the embed thumbnail comes from (`custom` uses embed.thumbnailUrl). */
  thumbnail: z.enum(WELCOME_THUMBNAILS).default('server'),
  dmEnabled: z.boolean().default(false),
  dmMessage: z.string().default(''),
  cardEnabled: z.boolean().default(false),
  cardBackground: z.string().url().nullable().default(null),
  leaveChannelId: z.string().nullable().default(null),
  leaveMessage: z
    .string()
    .default('**{user.name}** has left {server}. We now have {memberCount} members.'),
  /** Thank members who boost the server. Null disables. */
  boostChannelId: z.string().nullable().default(null),
  boostMessage: z
    .string()
    .default('🚀 {user} just boosted **{server}**! Thank you for supporting the city!'),
});

export type WelcomeConfig = z.infer<typeof welcomeConfigSchema>;
