import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { SearchResult } from 'lavalink-client';
import type { Command } from '../../framework/command';
import { RequireGuild, RequirePremium } from '../../lib/permissions';
import { brandedEmbed, errorEmbed } from '../../lib/embeds';
import { canQueue, queuedEmbed, type TrackRequester } from '../../lib/music';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a track or add it to the queue.')
    .addStringOption((o) =>
      o.setName('query').setDescription('Search terms or a track/playlist URL').setRequired(true),
    ),
  module: 'MUSIC',
  preconditions: [RequireGuild, RequirePremium('MUSIC')],
  async execute(interaction, ctx) {
    if (!interaction.inCachedGuild()) return;
    const manager = ctx.music;
    if (!manager?.useable) {
      await interaction.reply({
        embeds: [errorEmbed('The music service is currently unavailable. Try again shortly.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({
        embeds: [errorEmbed('Join a voice channel first.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = await ctx.config.getConfig(interaction.guildId, 'MUSIC');
    if (!canQueue(interaction.member, config)) {
      await interaction.reply({
        embeds: [errorEmbed('Only DJs can queue tracks on this server.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const query = interaction.options.getString('query', true);
    await interaction.deferReply();

    let player = manager.getPlayer(interaction.guildId);
    if (player && player.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
      await interaction.editReply({
        embeds: [errorEmbed(`I'm already playing in <#${player.voiceChannelId}>.`)],
      });
      return;
    }
    if (!player) {
      player = manager.createPlayer({
        guildId: interaction.guildId,
        voiceChannelId: voiceChannel.id,
        textChannelId: interaction.channelId,
        selfDeaf: true,
        volume: config.defaultVolume,
      });
    }
    if (!player.connected) await player.connect();

    if (player.queue.tracks.length >= config.maxQueueLength) {
      await interaction.editReply({
        embeds: [errorEmbed(`The queue is full (max ${config.maxQueueLength} tracks).`)],
      });
      return;
    }

    const requester: TrackRequester = {
      id: interaction.user.id,
      username: interaction.user.username,
    };
    const result = (await player.search({ query }, requester)) as SearchResult;

    if (result.loadType === 'error' || result.loadType === 'empty' || result.tracks.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed('No results found for that query.')] });
      return;
    }

    if (result.loadType === 'playlist') {
      await player.queue.add(result.tracks);
      await interaction.editReply({
        embeds: [
          brandedEmbed({
            kind: 'success',
            title: '➕ Playlist queued',
            description: `Added **${result.tracks.length}** tracks from **${result.playlist?.title ?? 'playlist'}**.`,
          }),
        ],
      });
    } else {
      const [track] = result.tracks;
      if (!track) {
        await interaction.editReply({ embeds: [errorEmbed('No results found for that query.')] });
        return;
      }
      await player.queue.add(track);
      const position = player.queue.tracks.length + (player.queue.current ? 1 : 0);
      await interaction.editReply({ embeds: [queuedEmbed(track, position)] });
    }

    if (!player.playing && !player.paused) await player.play();
  },
};

export default command;
