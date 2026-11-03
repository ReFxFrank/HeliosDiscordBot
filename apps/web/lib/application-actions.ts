'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@refx/database';
import {
  APPLICATION_MAX_QUESTIONS,
  applicationQuestionsSchema,
  applicationsConfigSchema,
  type ApplicationQuestionStyle,
} from '@refx/shared';
import { assertCanManage, requireSession } from './auth-guards';
import { applyModuleConfig } from './config-core';
import { publishLiveCommand } from './redis';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

/** Raw question shape sent from the client editor (ids are re-assigned server-side). */
export interface FormQuestionInput {
  label: string;
  style: ApplicationQuestionStyle;
  required: boolean;
  placeholder?: string | null;
  minLength?: number | null;
  maxLength?: number | null;
}

export interface FormInput {
  name: string;
  description?: string | null;
  reviewChannelId?: string | null;
  approveRoleId?: string | null;
  enabled: boolean;
  questions: FormQuestionInput[];
}

/**
 * Normalise + validate the client's form input into a storable shape. Question
 * ids are assigned server-side (index-based) so they're always unique and valid
 * modal custom-ids; blank-label rows are dropped, and the 5-question cap is
 * enforced.
 */
function buildFormData(input: FormInput): {
  name: string;
  description: string | null;
  reviewChannelId: string | null;
  approveRoleId: string | null;
  enabled: boolean;
  questions: unknown;
} | null {
  const name = input.name.trim().slice(0, 100);
  if (!name) return null;

  const rawQuestions = (input.questions ?? [])
    .filter((q) => q.label.trim().length > 0)
    .slice(0, APPLICATION_MAX_QUESTIONS)
    .map((q, index) => {
      const min = q.minLength != null && q.minLength > 0 ? Math.min(4000, q.minLength) : undefined;
      const max = q.maxLength != null && q.maxLength > 0 ? Math.min(4000, q.maxLength) : undefined;
      return {
        id: `q${index + 1}`,
        label: q.label.trim().slice(0, 45),
        style: q.style === 'short' ? 'short' : 'paragraph',
        required: Boolean(q.required),
        ...(q.placeholder?.trim() ? { placeholder: q.placeholder.trim().slice(0, 100) } : {}),
        ...(min != null ? { minLength: min } : {}),
        // Guarantee min ≤ max so the schema's refine can't reject a valid form.
        ...(max != null ? { maxLength: min != null ? Math.max(min, max) : max } : {}),
      };
    });

  const parsed = applicationQuestionsSchema.safeParse(rawQuestions);
  if (!parsed.success) return null;

  return {
    name,
    description: input.description?.trim().slice(0, 1000) || null,
    reviewChannelId: input.reviewChannelId || null,
    approveRoleId: input.approveRoleId || null,
    enabled: Boolean(input.enabled),
    questions: parsed.data,
  };
}

export async function createForm(guildId: string, input: FormInput): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const data = buildFormData(input);
  if (!data) return { ok: false, error: 'Give the form a name and valid questions.' };

  // FK: the guild row must exist before a form can reference it.
  await prisma.guild.upsert({ where: { id: guildId }, update: {}, create: { id: guildId } });
  const form = await prisma.applicationForm.create({
    data: { guildId, ...data, questions: data.questions as object },
  });
  revalidatePath(`/servers/${guildId}/applications`);
  return { ok: true, id: form.id };
}

export async function updateForm(
  guildId: string,
  formId: string,
  input: FormInput,
): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const existing = await prisma.applicationForm.findUnique({
    where: { id: formId },
    select: { guildId: true },
  });
  if (!existing || existing.guildId !== guildId) return { ok: false, error: 'Form not found.' };

  const data = buildFormData(input);
  if (!data) return { ok: false, error: 'Give the form a name and valid questions.' };

  await prisma.applicationForm.update({
    where: { id: formId },
    data: { ...data, questions: data.questions as object },
  });
  revalidatePath(`/servers/${guildId}/applications`);
  return { ok: true, id: formId };
}

export async function deleteForm(guildId: string, formId: string): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const existing = await prisma.applicationForm.findUnique({
    where: { id: formId },
    select: { guildId: true },
  });
  if (!existing || existing.guildId !== guildId) return { ok: false, error: 'Form not found.' };

  await prisma.applicationForm.delete({ where: { id: formId } });
  revalidatePath(`/servers/${guildId}/applications`);
  return { ok: true };
}

export async function saveApplicationsConfig(
  guildId: string,
  input: { staffRoleIds: string[] },
): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  const parsed = applicationsConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid settings.' };
  const result = await applyModuleConfig(guildId, 'APPLICATIONS', parsed.data, session.user.id);
  if (result.ok) revalidatePath(`/servers/${guildId}/applications`);
  return result;
}

/**
 * Approve/deny a submission from the dashboard: write the decision under a
 * pending guard, then hand the side effects (role grant, applicant DM, review
 * message edit) to the bot over a live command since only it has a gateway.
 */
export async function decideSubmission(
  guildId: string,
  submissionId: string,
  status: 'APPROVED' | 'DENIED',
  note: string | null,
): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);

  const submission = await prisma.applicationSubmission.findUnique({
    where: { id: submissionId },
    select: { guildId: true, status: true },
  });
  if (!submission || submission.guildId !== guildId) return { ok: false, error: 'Not found.' };
  if (submission.status !== 'PENDING') {
    return { ok: false, error: 'This application was already reviewed.' };
  }

  await prisma.applicationSubmission.update({
    where: { id: submissionId },
    data: {
      status,
      reviewerId: session.user.id,
      reviewNote: note?.trim().slice(0, 1000) || null,
      decidedAt: new Date(),
    },
  });
  await publishLiveCommand(guildId, 'APPLICATION_SIDE_EFFECTS', { submissionId }).catch(
    () => undefined,
  );
  revalidatePath(`/servers/${guildId}/applications`);
  return { ok: true };
}

/** Post the application panel (buttons that open each form) to a channel. */
export async function deployApplicationPanel(
  guildId: string,
  channelId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  await assertCanManage(session, guildId);
  if (!channelId) return { ok: false, error: 'Pick a channel first.' };

  const enabled = await prisma.applicationForm.count({ where: { guildId, enabled: true } });
  if (enabled === 0) return { ok: false, error: 'Create and enable at least one form first.' };

  await publishLiveCommand(guildId, 'DEPLOY_APPLICATION_PANEL', { channelId });
  return { ok: true };
}
