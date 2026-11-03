import { z } from 'zod';

/**
 * Reusable embed specification (§8 Custom commands / embed builder). A bounded,
 * declarative description of a Discord embed that the dashboard builds and the
 * bot renders into an EmbedBuilder. Shared so the dashboard validates exactly
 * what the bot will accept. Every field is optional and additive, so older
 * stored specs (title/description/color/url/images/footer only) keep parsing.
 */

/** Hex color, with or without a leading '#'. */
const hexColor = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}$/, 'Use a hex color like #0072FF');

/** A single embed field. Discord allows up to 25 per embed. */
export const embedFieldSchema = z.object({
  name: z.string().min(1).max(256),
  value: z.string().min(1).max(1024),
  inline: z.boolean().default(false),
});
export type EmbedField = z.infer<typeof embedFieldSchema>;

/** Embed author line (small text + optional icon above the title). */
export const embedAuthorSchema = z.object({
  name: z.string().min(1).max(256),
  iconUrl: z.string().url().optional(),
  url: z.string().url().optional(),
});
export type EmbedAuthor = z.infer<typeof embedAuthorSchema>;

export const embedSpecSchema = z.object({
  author: embedAuthorSchema.optional(),
  title: z.string().max(256).optional(),
  description: z.string().max(4000).optional(),
  color: hexColor.optional(),
  url: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  fields: z.array(embedFieldSchema).max(25).optional(),
  footer: z.string().max(2048).optional(),
  /** Only rendered when `footer` text is also present (Discord requirement). */
  footerIconUrl: z.string().url().optional(),
  /** Stamp the embed with the current time when it is sent. */
  timestamp: z.boolean().optional(),
});

export type EmbedSpec = z.infer<typeof embedSpecSchema>;

/** Whether an embed spec carries any renderable content. */
export function embedSpecHasContent(spec: EmbedSpec | null | undefined): boolean {
  if (!spec) return false;
  return Boolean(
    spec.title ||
      spec.description ||
      spec.imageUrl ||
      spec.thumbnailUrl ||
      spec.footer ||
      spec.author?.name ||
      (spec.fields && spec.fields.length > 0),
  );
}
