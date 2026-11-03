import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type BaseMessageOptions,
  type ButtonInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
} from 'discord.js';
import { verificationGateError, type VerificationConfig } from '@refx/shared';
import { brandedEmbed, errorEmbed } from '../lib/embeds';
import { generateCaptchaCode, renderCaptcha } from '../lib/captcha';
import { buildCustomId } from '../framework/customId';
import type { BotContext } from '../framework/context';

/** Pending captcha challenges expire after this long. */
const CAPTCHA_TTL_SECONDS = 600;

interface CaptchaState {
  code: string;
  attempts: number;
}

const captchaKey = (guildId: string, userId: string): string =>
  `verify:captcha:${guildId}:${userId}`;

async function readCaptchaState(
  ctx: BotContext,
  guildId: string,
  userId: string,
): Promise<CaptchaState | null> {
  const raw = await ctx.redis.get(captchaKey(guildId, userId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CaptchaState;
  } catch {
    return null;
  }
}

async function writeCaptchaState(
  ctx: BotContext,
  guildId: string,
  userId: string,
  state: CaptchaState,
): Promise<void> {
  await ctx.redis.set(
    captchaKey(guildId, userId),
    JSON.stringify(state),
    'EX',
    CAPTCHA_TTL_SECONDS,
  );
}

async function clearCaptchaState(ctx: BotContext, guildId: string, userId: string): Promise<void> {
  await ctx.redis.del(captchaKey(guildId, userId)).catch(() => undefined);
}

/** The message + button posted by the panel deploy (dashboard or /verification). */
export function buildVerificationPanel(config: VerificationConfig): BaseMessageOptions {
  const embed = brandedEmbed({ title: config.panelTitle, description: config.panelMessage });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId('verify', 'do'))
      .setLabel(config.buttonLabel)
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
  );
  return { embeds: [embed], components: [row] };
}

/** Add the optional "unverified" gate role when a member joins. */
export async function handleVerificationJoin(member: GuildMember, ctx: BotContext): Promise<void> {
  if (!(await ctx.config.isEnabled(member.guild.id, 'VERIFICATION'))) return;
  const config = await ctx.config.getConfig(member.guild.id, 'VERIFICATION');
  if (!config.unverifiedRoleId || member.user.bot) return;

  const role = member.guild.roles.cache.get(config.unverifiedRoleId);
  const me = member.guild.members.me;
  if (!role || !me || role.position >= me.roles.highest.position) return;

  await member.roles
    .add(role.id, 'Verification gate')
    .catch((err: unknown) =>
      ctx.logger.warn({ err, guildId: member.guild.id }, 'Failed to add unverified role on join'),
    );
}

/** Best-effort verification event log (pass/fail/kick) to the configured channel. */
async function logVerification(
  ctx: BotContext,
  guildId: string,
  config: VerificationConfig,
  kind: 'success' | 'warning' | 'danger',
  description: string,
): Promise<void> {
  if (!config.logChannelId) return;
  try {
    const channel =
      ctx.client.channels.cache.get(config.logChannelId) ??
      (await ctx.client.channels.fetch(config.logChannelId));
    if (channel?.isTextBased() && 'send' in channel) {
      await channel.send({
        embeds: [brandedEmbed({ kind, description })],
        allowedMentions: { parse: [] },
      });
    }
  } catch (err) {
    ctx.logger.warn({ err, guildId }, 'Verification log post failed');
  }
}

/**
 * Grant the verified role (and clear the gate role). Returns a user-facing
 * error string, or null on success.
 */
async function grantVerifiedRole(
  member: GuildMember,
  config: VerificationConfig,
  ctx: BotContext,
): Promise<string | null> {
  const role = member.guild.roles.cache.get(config.verifiedRoleId);
  if (!role) return 'The verified role no longer exists — ask an admin to fix the config.';

  const me = member.guild.members.me;
  if (
    !me ||
    !me.permissions.has(PermissionFlagsBits.ManageRoles) ||
    role.position >= me.roles.highest.position
  ) {
    return 'I can’t assign the verified role — move my role above it and grant Manage Roles.';
  }

  try {
    await member.roles.add(role.id, 'Verification');
    if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) {
      await member.roles.remove(config.unverifiedRoleId, 'Verification').catch(() => undefined);
    }
  } catch (err) {
    ctx.logger.warn({ err, guildId: member.guild.id }, 'Verification role assignment failed');
    return 'I couldn’t assign the role — check that my permissions are intact.';
  }
  return null;
}

/** Build the ephemeral captcha challenge message (image + Enter-code button). */
async function buildCaptchaChallenge(
  code: string,
  attemptsUsed: number,
  config: VerificationConfig,
): Promise<BaseMessageOptions> {
  const png = await renderCaptcha(code);
  const remaining = config.maxAttempts - attemptsUsed;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId('verify', 'code'))
      .setLabel('Enter code')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⌨️'),
  );
  return {
    embeds: [
      brandedEmbed({
        kind: 'info',
        title: '🤖 Human check',
        description:
          `Type the code shown below. You have **${remaining}** attempt${remaining === 1 ? '' : 's'} ` +
          `and the code expires in ${Math.floor(CAPTCHA_TTL_SECONDS / 60)} minutes.`,
      }).setImage('attachment://captcha.png'),
    ],
    files: [new AttachmentBuilder(png, { name: 'captcha.png' })],
    components: [row],
  };
}

/** Panel button click — verify directly (button) or issue a captcha (captcha). */
export async function startVerification(
  interaction: ButtonInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const config = await ctx.config.getConfig(interaction.guildId, 'VERIFICATION');

  if (!config.verifiedRoleId) {
    await interaction.reply({
      embeds: [errorEmbed('Verification isn’t set up on this server.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = interaction.member;
  if (member.roles.cache.has(config.verifiedRoleId)) {
    await interaction.reply({
      content: 'You’re already verified. ✅',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Anti-alt gate: enforce account/membership age before ANY method proceeds.
  const gateError = verificationGateError(
    config,
    member.user.createdTimestamp,
    member.joinedTimestamp,
    Date.now(),
  );
  if (gateError) {
    await interaction.reply({ embeds: [errorEmbed(gateError)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (config.method === 'button') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const error = await grantVerifiedRole(member, config, ctx);
    if (error) {
      await interaction.editReply({ embeds: [errorEmbed(error)] });
      return;
    }
    await interaction.editReply({ content: config.successMessage });
    await logVerification(
      ctx,
      interaction.guildId,
      config,
      'success',
      `✅ <@${member.id}> verified.`,
    );
    return;
  }

  // Captcha: (re)issue a code but PRESERVE the attempt count, so clicking the
  // panel button again can't reset a nearly-exhausted challenge.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const existing = await readCaptchaState(ctx, interaction.guildId, member.id);
  const state: CaptchaState = {
    code: generateCaptchaCode(config.captchaLength),
    attempts: existing?.attempts ?? 0,
  };
  await writeCaptchaState(ctx, interaction.guildId, member.id, state);
  await interaction.editReply(await buildCaptchaChallenge(state.code, state.attempts, config));
}

/** "Enter code" button — open the captcha modal. */
export async function promptCaptchaModal(
  interaction: ButtonInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const state = await readCaptchaState(ctx, interaction.guildId, interaction.user.id);
  if (!state) {
    await interaction.reply({
      embeds: [errorEmbed('This captcha expired — click the Verify button to get a new one.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(buildCustomId('verify', 'submit'))
    .setTitle('Verification')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('code')
          .setLabel('Enter the code from the image')
          .setStyle(TextInputStyle.Short)
          .setMinLength(state.code.length)
          .setMaxLength(state.code.length)
          .setRequired(true),
      ),
    );
  await interaction.showModal(modal);
}

/** Captcha modal submit — compare the code and verify / count the failure. */
export async function handleCaptchaSubmit(
  interaction: ModalSubmitInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const config = await ctx.config.getConfig(interaction.guildId, 'VERIFICATION');
  const member = interaction.member;

  const state = await readCaptchaState(ctx, interaction.guildId, member.id);
  if (!state) {
    await interaction.reply({
      embeds: [errorEmbed('This captcha expired — click the Verify button to get a new one.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guess = interaction.fields.getTextInputValue('code').trim().toUpperCase();
  if (guess === state.code.toUpperCase()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await clearCaptchaState(ctx, interaction.guildId, member.id);
    const error = await grantVerifiedRole(member, config, ctx);
    if (error) {
      await interaction.editReply({ embeds: [errorEmbed(error)] });
      return;
    }
    await interaction.editReply({ content: config.successMessage });
    await logVerification(
      ctx,
      interaction.guildId,
      config,
      'success',
      `✅ <@${member.id}> passed the captcha and verified.`,
    );
    return;
  }

  // Wrong code.
  const attempts = state.attempts + 1;
  if (attempts >= config.maxAttempts) {
    await clearCaptchaState(ctx, interaction.guildId, member.id);
    if (config.failAction === 'kick') {
      await interaction.reply({
        embeds: [errorEmbed('Wrong code — you’re out of attempts.')],
        flags: MessageFlags.Ephemeral,
      });
      // DM before the kick — afterwards the bot can no longer reach the member.
      await member.user
        .send(
          `You failed verification in **${interaction.guild.name}** and were removed. You can rejoin and try again.`,
        )
        .catch(() => undefined);
      const kicked = await member
        .kick('Failed verification captcha')
        .then(() => true)
        .catch(() => false);
      await logVerification(
        ctx,
        interaction.guildId,
        config,
        'danger',
        kicked
          ? `👢 <@${member.id}> failed the captcha ${attempts}× and was kicked.`
          : `⚠️ <@${member.id}> failed the captcha ${attempts}× — kick failed (check my permissions).`,
      );
      return;
    }
    await interaction.reply({
      embeds: [
        errorEmbed('Wrong code — you’re out of attempts. Click the Verify button to start over.'),
      ],
      flags: MessageFlags.Ephemeral,
    });
    await logVerification(
      ctx,
      interaction.guildId,
      config,
      'warning',
      `⚠️ <@${member.id}> failed the captcha ${attempts}×.`,
    );
    return;
  }

  await writeCaptchaState(ctx, interaction.guildId, member.id, { ...state, attempts });
  const remaining = config.maxAttempts - attempts;
  await interaction.reply({
    embeds: [
      errorEmbed(
        `Wrong code — **${remaining}** attempt${remaining === 1 ? '' : 's'} left. ` +
          'Use the image above, or click Verify for a fresh code.',
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}
