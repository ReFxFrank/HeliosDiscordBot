import { prisma } from '@refx/database';
import {
  applicationsConfigSchema,
  parseApplicationAnswers,
  parseApplicationQuestions,
} from '@refx/shared';
import { guardGuildAccess } from '../../../../lib/auth-guards';
import { getGuildEntities } from '../../../../lib/discord-guild';
import { ApplicationsManager } from '../../../../components/applications-manager';

export const dynamic = 'force-dynamic';

export default async function ApplicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardGuildAccess(id);

  const [row, formRows, submissionRows, { roles, channels }] = await Promise.all([
    prisma.guildModuleConfig.findUnique({
      where: { guildId_module: { guildId: id, module: 'APPLICATIONS' } },
      select: { config: true },
    }),
    prisma.applicationForm.findMany({ where: { guildId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.applicationSubmission.findMany({
      where: { guildId: id, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: { form: { select: { name: true } } },
    }),
    getGuildEntities(id),
  ]);

  const config = applicationsConfigSchema.parse(row?.config ?? {});
  const forms = formRows.map((form) => ({
    id: form.id,
    name: form.name,
    description: form.description,
    reviewChannelId: form.reviewChannelId,
    approveRoleId: form.approveRoleId,
    enabled: form.enabled,
    questions: parseApplicationQuestions(form.questions),
  }));
  const submissions = submissionRows.map((submission) => ({
    id: submission.id,
    formName: submission.form.name,
    userId: submission.userId,
    createdAt: submission.createdAt.toISOString(),
    answers: parseApplicationAnswers(submission.answers),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white/90">Applications</h2>
        <p className="text-sm text-white/50">
          Build forms for staff applications, ban appeals, or anything else. Members apply with{' '}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 text-xs">/apply</code> or a panel;
          submissions post to a review channel and appear here to approve or deny.
        </p>
      </div>
      <ApplicationsManager
        guildId={id}
        initialForms={forms}
        initialSubmissions={submissions}
        config={config}
        roles={roles}
        channels={channels}
      />
    </div>
  );
}
