import { z } from 'zod';
import { BRAND, FEATURES } from '../constants';
import { embedSpecSchema } from '../embed';

export const WELCOME_THUMBNAILS = ['server', 'user', 'custom', 'none'] as const;
export type WelcomeThumbnail = (typeof WELCOME_THUMBNAILS)[number];

/**
 * Default welcome embed. On a FiveM instance it is modelled on the card ReFx
 * used before (MEE6), pointing new members at the rules and verification;
 * channel and role mentions are filled in by `/refx-setup`. Other instances
 * get a neutral community greeting in the brand colour.
 */
export const DEFAULT_WELCOME_EMBED = (
  FEATURES.fivem
    ? {
        author: { name: BRAND.name },
        title: 'Welcome!',
        description:
          'Welcome {user}\n\n' +
          'Feel free to have a look around, if you have any questions, please feel free to message a member of the Admin or Staff Team for assistance!\n\n' +
          'Please head over to the rules channel to review the city and community rules. Then answer the quick join questions to unlock the rest of the community, or hit Start Verification in the verify channel.\n\n' +
          'Hope to see you out on the streets!',
        color: '#70B0FF',
        footer: BRAND.footer,
      }
    : {
        author: { name: BRAND.name },
        title: 'Welcome!',
        description:
          'Welcome {user} to **{server}**!\n\n' +
          'Have a look around and say hi. Please give the rules a quick read first.\n\n' +
          'You are member #{memberCount}.',
        color: BRAND.colorHex,
        footer: BRAND.footer,
      }
) satisfies z.input<typeof embedSpecSchema>;

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
  /** Picture shown above the welcome (an image-only embed, so it sits at the top). Null = none. */
  bannerUrl: z.string().url().nullable().default(null),
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
