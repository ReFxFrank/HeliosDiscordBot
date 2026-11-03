import { EmbedBuilder, type ColorResolvable } from 'discord.js';
import { embedSpecHasContent, type EmbedSpec } from '@refx/shared';

/**
 * Render an EmbedSpec into a discord.js EmbedBuilder, optionally running each
 * text field through `transform` (placeholder substitution). Returns null when
 * the spec has no renderable content so callers can omit the embed entirely.
 */
export function buildEmbedFromSpec(
  spec: EmbedSpec,
  transform: (value: string) => string = (value) => value,
): EmbedBuilder | null {
  if (!embedSpecHasContent(spec)) return null;
  const embed = new EmbedBuilder();

  if (spec.author?.name) {
    embed.setAuthor({
      name: transform(spec.author.name).slice(0, 256),
      iconURL: spec.author.iconUrl,
      url: spec.author.url,
    });
  }
  if (spec.title) embed.setTitle(transform(spec.title).slice(0, 256));
  if (spec.description) embed.setDescription(transform(spec.description).slice(0, 4096));
  if (spec.url && spec.title) embed.setURL(spec.url);
  if (spec.color) {
    embed.setColor(Number.parseInt(spec.color.replace('#', ''), 16) as ColorResolvable);
  }
  if (spec.imageUrl) embed.setImage(spec.imageUrl);
  if (spec.thumbnailUrl) embed.setThumbnail(spec.thumbnailUrl);
  if (spec.fields && spec.fields.length > 0) {
    embed.addFields(
      spec.fields.slice(0, 25).map((field) => ({
        name: transform(field.name).slice(0, 256) || '​',
        value: transform(field.value).slice(0, 1024) || '​',
        inline: field.inline,
      })),
    );
  }
  // Discord only shows a footer icon when footer text is present.
  if (spec.footer) {
    embed.setFooter({
      text: transform(spec.footer).slice(0, 2048),
      iconURL: spec.footerIconUrl,
    });
  }
  if (spec.timestamp) embed.setTimestamp(new Date());

  return embed;
}
