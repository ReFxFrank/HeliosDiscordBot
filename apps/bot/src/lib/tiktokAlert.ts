import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { BRAND } from '@refx/shared';
import { tiktokUploadedAt, type TikTokVideo } from './tiktok';

/** The new-TikTok alert: caption, cover picture and a Watch button. */

const TIKTOK_PINK = 0xfe2c55;

/** The caption's first line as a title, the rest as the description. */
export function splitTikTokCaption(caption: string): { title: string; body: string } {
  const lines = caption.trim().split('\n');
  const first = lines[0]?.trim() ?? '';
  const rest = lines.slice(1).join('\n').trim();
  if (!first) return { title: 'New TikTok', body: '' };
  const title = first.length > 256 ? `${first.slice(0, 255)}…` : first;
  const overflow = first.length > 256 ? first.slice(255) : '';
  const body = [overflow, rest].filter(Boolean).join('\n');
  return { title, body: body.length > 600 ? `${body.slice(0, 599)}…` : body };
}

/**
 * `coverAttachment` is the file name of a cover sent with the message; without
 * one the embed falls back to TikTok's (expiring) cover link.
 */
export function buildTikTokVideoEmbed(
  video: TikTokVideo,
  coverAttachment: string | null,
): EmbedBuilder {
  const { title, body } = splitTikTokCaption(video.description);
  const embed = new EmbedBuilder()
    .setColor(TIKTOK_PINK)
    .setAuthor({
      name: `${video.authorName} posted on TikTok`.slice(0, 256),
      iconURL: video.avatarUrl ?? undefined,
      url: video.profileUrl,
    })
    .setTitle(title)
    .setURL(video.url)
    .setFooter({ text: BRAND.footer })
    .setTimestamp(tiktokUploadedAt(video.id));
  if (body) embed.setDescription(body);
  const image = coverAttachment ? `attachment://${coverAttachment}` : video.coverUrl;
  if (image) embed.setImage(image);
  return embed;
}

export function buildTikTokWatchRow(url: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Watch on TikTok').setURL(url),
  );
}
