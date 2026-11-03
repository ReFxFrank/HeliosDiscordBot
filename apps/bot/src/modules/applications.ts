import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type BaseMessageOptions,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
  type ModalSubmitInteraction,
} from 'discord.js';
import { prisma, type ApplicationForm, type ApplicationStatus } from '@refx/database';
import {
  APPLICATION_MAX_QUESTIONS,
  parseApplicationAnswers,
  parseApplicationQuestions,
  parseModuleConfig,
  type ApplicationAnswer,
  type ApplicationsConfig,
} from '@refx/shared';
import { brandedEmbed } from '../lib/embeds';
import { buildCustomId } from '../framework/customId';
import type { Logger } from '../logger';

export interface ApplicationDeps {
  client: Client;
  logger: Logger;
}

type EmbedKind = 'info' | 'success' | 'danger';
const STATUS_META: Record<ApplicationStatus, { label: string; emoji: string; kind: EmbedKind }> = {
  PENDING: { label: 'Pending', emoji: '📋', kind: 'info' },
  APPROVED: { label: 'Approved', emoji: '✅', kind: 'success' },
  DENIED: { label: 'Denied', emoji: '⛔', kind: 'danger' },
};

export async function getApplicationsConfig(guildId: string): Promise<ApplicationsConfig> {
  const row = await prisma.guildModuleConfig.findUnique({
    where: { guildId_module: { guildId, module: 'APPLICATIONS' } },
    select: { config: true },
  });
  return parseModuleConfig('APPLICATIONS', row?.config ?? {});
}

/** Enabled forms for a guild, oldest first (stable panel/command ordering). */
export async function getEnabledForms(guildId: string): Promise<ApplicationForm[]> {
  return prisma.applicationForm.findMany({
    where: { guildId, enabled: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getFormById(id: string): Promise<ApplicationForm | null> {
  return prisma.applicationForm.findUnique({ where: { id } });
}

/** Build the modal a member fills out for a form (customId `apply:submit:<formId>`). */
export function buildApplicationModal(form: ApplicationForm): ModalBuilder {
  const questions = parseApplicationQuestions(form.questions).slice(0, APPLICATION_MAX_QUESTIONS);
  const modal = new ModalBuilder()
    .setCustomId(buildCustomId('apply', 'submit', form.id))
    .setTitle(form.name.slice(0, 45));
  for (const question of questions) {
    const input = new TextInputBuilder()
      .setCustomId(question.id)
      .setLabel(question.label.slice(0, 45))
      .setStyle(question.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
      .setRequired(question.required);
    if (question.placeholder) input.setPlaceholder(question.placeholder.slice(0, 100));
    if (question.minLength != null) input.setMinLength(question.minLength);
    if (question.maxLength != null) input.setMaxLength(question.maxLength);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  return modal;
}

/** The panel embed + one button per form (up to 5) that opens the apply modal. */
export function buildApplyPanelMessage(forms: ApplicationForm[]): BaseMessageOptions {
  const shown = forms.slice(0, 5);
  const embed = brandedEmbed({
    title: '📋 Applications',
    description:
      'Click a button below to start an application. Your answers are sent to the staff team.',
  });
  for (const form of shown) {
    embed.addFields({
      name: form.name.slice(0, 256),
      value: (form.description?.trim() || 'Open to apply.').slice(0, 1024),
    });
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    shown.map((form) =>
      new ButtonBuilder()
        .setCustomId(buildCustomId('apply', 'open', form.id))
        .setLabel(form.name.slice(0, 80))
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📝'),
    ),
  );
  return { embeds: [embed], components: [row] };
}

/** Safe text-input read: getTextInputValue throws if the field is absent (e.g. a
 * question removed while the modal was open), so treat that as an empty answer. */
export function modalFieldValue(interaction: ModalSubmitInteraction, customId: string): string {
  try {
    return interaction.fields.getTextInputValue(customId).trim();
  } catch {
    return '';
  }
}

/** Read the submitted modal fields into answers, keyed by the form's questions. */
export function readModalAnswers(
  interaction: ModalSubmitInteraction,
  form: ApplicationForm,
): ApplicationAnswer[] {
  const questions = parseApplicationQuestions(form.questions).slice(0, APPLICATION_MAX_QUESTIONS);
  return questions.map((question) => ({
    questionId: question.id,
    label: question.label,
    value: modalFieldValue(interaction, question.id),
  }));
}

async function resolveChannel(
  client: Client,
  guildId: string,
  channelId: string,
): Promise<GuildTextBasedChannel | null> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));
  return channel && channel.isTextBased() && !channel.isDMBased() ? channel : null;
}

function buildReviewMessage(opts: {
  formName: string;
  applicantId: string;
  applicantTag: string;
  answers: ApplicationAnswer[];
  status: ApplicationStatus;
  submissionId: string;
  reviewerId?: string | null;
  reviewNote?: string | null;
}): BaseMessageOptions {
  const meta = STATUS_META[opts.status];
  const embed = brandedEmbed({
    kind: meta.kind,
    title: `${meta.emoji} ${opts.formName} — ${meta.label}`,
  }).setDescription(`From <@${opts.applicantId}> (\`${opts.applicantTag}\`)`);

  for (const answer of opts.answers.slice(0, 24)) {
    embed.addFields({
      name: answer.label.slice(0, 256) || 'Answer',
      value: (answer.value || '*(blank)*').slice(0, 1024),
    });
  }
  if (opts.status !== 'PENDING' && opts.reviewerId) {
    embed.addFields({
      name: `${meta.label} by`,
      value: `<@${opts.reviewerId}>${opts.reviewNote ? ` — ${opts.reviewNote}` : ''}`.slice(
        0,
        1024,
      ),
    });
  }

  // Buttons only while awaiting a decision; a decided message keeps the record
  // but drops the actions so it can't be re-decided from a stale message.
  const components =
    opts.status === 'PENDING'
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(buildCustomId('apply', 'decide', 'APPROVED', opts.submissionId))
              .setLabel('Approve')
              .setEmoji('✅')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(buildCustomId('apply', 'decide', 'DENIED', opts.submissionId))
              .setLabel('Deny')
              .setEmoji('⛔')
              .setStyle(ButtonStyle.Danger),
          ),
        ]
      : [];
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

/**
 * Record a submission and post it to the form's review channel. Rejects a
 * second pending submission from the same user to the same form.
 */
export async function recordSubmission(
  opts: {
    guildId: string;
    form: ApplicationForm;
    applicantId: string;
    applicantTag: string;
    answers: ApplicationAnswer[];
  },
  deps: ApplicationDeps,
): Promise<{ ok: true } | { error: string }> {
  const pending = await prisma.applicationSubmission.findFirst({
    where: { formId: opts.form.id, userId: opts.applicantId, status: 'PENDING' },
    select: { id: true },
  });
  if (pending) {
    return {
      error: 'You already have a pending application for this form. Please wait for a decision.',
    };
  }

  const submission = await prisma.applicationSubmission.create({
    data: {
      formId: opts.form.id,
      guildId: opts.guildId,
      userId: opts.applicantId,
      answers: opts.answers,
    },
  });

  if (opts.form.reviewChannelId) {
    const channel = await resolveChannel(deps.client, opts.guildId, opts.form.reviewChannelId);
    if (channel) {
      const sent = await channel
        .send(
          buildReviewMessage({
            formName: opts.form.name,
            applicantId: opts.applicantId,
            applicantTag: opts.applicantTag,
            answers: opts.answers,
            status: 'PENDING',
            submissionId: submission.id,
          }),
        )
        .catch((err: unknown) => {
          deps.logger.warn({ err, guildId: opts.guildId }, 'Application review post failed');
          return null;
        });
      if (sent) {
        await prisma.applicationSubmission.update({
          where: { id: submission.id },
          data: { channelId: channel.id, messageId: sent.id },
        });
      }
    }
  }
  return { ok: true };
}

/** Grant the approve-role to the applicant (best-effort, with hierarchy checks). */
async function grantApproveRole(
  guild: Guild,
  roleId: string,
  userId: string,
  logger: Logger,
): Promise<void> {
  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
  const me = guild.members.me;
  if (!role || !me) return;
  if (
    !me.permissions.has(PermissionFlagsBits.ManageRoles) ||
    role.position >= me.roles.highest.position
  ) {
    return;
  }
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await member.roles
    .add(role.id, 'Application approved')
    .catch((err: unknown) => logger.warn({ err, guildId: guild.id }, 'Approve-role grant failed'));
}

async function dmApplicant(
  client: Client,
  userId: string,
  formName: string,
  status: ApplicationStatus,
  note: string | null,
): Promise<void> {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return;
  const approved = status === 'APPROVED';
  await user
    .send({
      embeds: [
        brandedEmbed({
          kind: approved ? 'success' : 'danger',
          title: approved ? '✅ Application approved' : '⛔ Application denied',
          description:
            `Your **${formName}** application was ${approved ? 'approved' : 'denied'}.` +
            (note ? `\n\n> ${note}` : ''),
        }),
      ],
    })
    .catch(() => undefined);
}

/**
 * Carry out the side effects of an already-recorded decision: grant the
 * approve-role on approval, DM the applicant, and edit the review message in
 * place (dropping its buttons). Reads state from the DB so it can be triggered
 * either inline (Discord buttons) or by the dashboard over a live command.
 * A still-pending submission is a no-op.
 */
export async function runDecisionSideEffects(
  submissionId: string,
  deps: ApplicationDeps,
): Promise<void> {
  const submission = await prisma.applicationSubmission.findUnique({
    where: { id: submissionId },
    include: { form: true },
  });
  if (!submission || submission.status === 'PENDING') return;

  const guild = deps.client.guilds.cache.get(submission.guildId);
  if (submission.status === 'APPROVED' && submission.form.approveRoleId && guild) {
    await grantApproveRole(guild, submission.form.approveRoleId, submission.userId, deps.logger);
  }

  await dmApplicant(
    deps.client,
    submission.userId,
    submission.form.name,
    submission.status,
    submission.reviewNote ?? null,
  );

  if (submission.channelId && submission.messageId) {
    const channel = await resolveChannel(deps.client, submission.guildId, submission.channelId);
    const message = channel
      ? await channel.messages.fetch(submission.messageId).catch(() => null)
      : null;
    if (message) {
      const applicant = await deps.client.users.fetch(submission.userId).catch(() => null);
      await message
        .edit(
          buildReviewMessage({
            formName: submission.form.name,
            applicantId: submission.userId,
            applicantTag: applicant?.tag ?? submission.userId,
            answers: parseApplicationAnswers(submission.answers),
            status: submission.status,
            submissionId: submission.id,
            reviewerId: submission.reviewerId,
            reviewNote: submission.reviewNote,
          }),
        )
        .catch(() => undefined);
    }
  }
}

/**
 * Apply a staff decision (Discord-button path): persist it under a pending guard,
 * then run the side effects. Idempotent — an already-decided submission is left
 * untouched.
 */
export async function decideApplication(
  opts: {
    submissionId: string;
    reviewerId: string;
    status: ApplicationStatus;
    note: string | null;
  },
  deps: ApplicationDeps,
): Promise<{ ok: true; formName: string; applicantId: string } | { error: string }> {
  const submission = await prisma.applicationSubmission.findUnique({
    where: { id: opts.submissionId },
    include: { form: true },
  });
  if (!submission) return { error: 'That application no longer exists.' };
  if (submission.status !== 'PENDING') {
    return { error: `This application was already ${submission.status.toLowerCase()}.` };
  }

  await prisma.applicationSubmission.update({
    where: { id: submission.id },
    data: {
      status: opts.status,
      reviewerId: opts.reviewerId,
      reviewNote: opts.note,
      decidedAt: new Date(),
    },
  });
  await runDecisionSideEffects(submission.id, deps);
  return { ok: true, formName: submission.form.name, applicantId: submission.userId };
}
