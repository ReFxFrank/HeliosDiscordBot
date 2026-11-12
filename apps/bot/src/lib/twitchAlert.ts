import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbed,
} from 'discord.js';
import { BRAND, formatStreamDuration, twitchPreviewUrl } from '@refx/shared';
import type { TwitchStream } from './social';

/**
 * The Twitch go-live alert: one message per broadcast. It is posted when the
 * stream starts, re-rendered on every poll while it runs (fresh preview frame
 * and viewer count) and rewritten into a short "was live" summary at the end.
 */

const TWITCH_PURPLE = 0x9146ff;
const ENDED_GREY = 0x6b7280;
const LIVE_SUFFIX = ' is live on Twitch';
const ENDED_SUFFIX = ' was live on Twitch';

export function buildTwitchLiveEmbed(stream: TwitchStream, now = Date.now()): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(TWITCH_PURPLE)
    .setAuthor({
      name: `${stream.userName}${LIVE_SUFFIX}`.slice(0, 256),
      iconURL: stream.avatarUrl ?? undefined,
      url: stream.url,
    })
    .setTitle((stream.title || 'Live now').slice(0, 256))
    .setURL(stream.url)
    .addFields(
      { name: 'Playing', value: stream.game || 'Just chatting', inline: true },
      { name: 'Viewers', value: stream.viewers.toLocaleString('en-US'), inline: true },
    )
    .setFooter({ text: `${BRAND.footer} • Started` })
    .setTimestamp(new Date(stream.startedAt));
  if (stream.avatarUrl) embed.setThumbnail(stream.avatarUrl);
  // Minute-level bust: a new frame each poll without a new URL every second.
  const preview = twitchPreviewUrl(stream.thumbnailUrl, Math.floor(now / 60_000));
  if (preview) embed.setImage(preview);
  return embed;
}

export function buildTwitchWatchRow(url: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Watch on Twitch').setURL(url),
  );
}

/**
 * Turn a live alert into its "ended" form. Built from the embed already on the
 * message, because Twitch no longer returns the stream once it is offline.
 */
export function buildTwitchEndedEmbed(
  live: Pick<APIEmbed, 'author' | 'title' | 'url' | 'fields' | 'thumbnail'>,
  startedAt: string | null,
  now = Date.now(),
): EmbedBuilder {
  const authorName = live.author?.name ?? 'The stream';
  const name = authorName.endsWith(LIVE_SUFFIX)
    ? authorName.slice(0, -LIVE_SUFFIX.length)
    : authorName;
  const embed = new EmbedBuilder()
    .setColor(ENDED_GREY)
    .setAuthor({
      name: `${name}${ENDED_SUFFIX}`.slice(0, 256),
      iconURL: live.author?.icon_url,
      url: live.author?.url ?? live.url,
    })
    .setFooter({ text: `${BRAND.footer} • Stream ended` })
    .setTimestamp(new Date(now));
  if (live.title) embed.setTitle(live.title);
  if (live.url) embed.setURL(live.url);
  if (live.thumbnail?.url) embed.setThumbnail(live.thumbnail.url);

  const game = live.fields?.find((field) => field.name === 'Playing');
  if (game) embed.addFields({ name: 'Played', value: game.value, inline: true });
  const started = startedAt ? Date.parse(startedAt) : Number.NaN;
  if (!Number.isNaN(started) && now > started) {
    embed.addFields({ name: 'Duration', value: formatStreamDuration(now - started), inline: true });
  }
  return embed;
}
