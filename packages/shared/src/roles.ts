import { z } from 'zod';

export const rolePanelModes = ['NORMAL', 'UNIQUE', 'VERIFY'] as const;
export type RolePanelMode = (typeof rolePanelModes)[number];

export const rolePanelTypes = ['BUTTON', 'SELECT'] as const;
export type RolePanelType = (typeof rolePanelTypes)[number];

export const rolePanelOptionSchema = z.object({
  roleId: z.string().min(1),
  label: z.string().min(1).max(80),
  emoji: z.string().max(64).optional(),
  description: z.string().max(100).optional(),
});
export type RolePanelOption = z.infer<typeof rolePanelOptionSchema>;

/** Validated input for creating/updating a role panel (dashboard + bot). */
export const rolePanelInputSchema = z.object({
  title: z.string().min(1).max(256),
  description: z.string().max(2000).nullable().default(null),
  channelId: z.string().nullable().default(null),
  mode: z.enum(rolePanelModes).default('NORMAL'),
  type: z.enum(rolePanelTypes).default('BUTTON'),
  // Duplicate roleIds produce duplicate component custom-ids/values, which
  // Discord rejects at send time — reject them up front instead.
  options: z
    .array(rolePanelOptionSchema)
    .min(1)
    .max(25)
    .refine((opts) => new Set(opts.map((o) => o.roleId)).size === opts.length, {
      message: 'Each role can appear only once per panel.',
    }),
});
export type RolePanelInput = z.infer<typeof rolePanelInputSchema>;

/**
 * Why a panel draft can't be saved, in words an admin can act on (empty when it
 * is valid). Used by the dashboard form and its server action so both say the
 * same thing instead of a bare "could not save".
 */
export function rolePanelProblems(input: unknown): string[] {
  const result = rolePanelInputSchema.safeParse(input);
  if (result.success) return [];
  const problems = new Set<string>();
  for (const issue of result.error.issues) {
    const [field, index, part] = issue.path;
    const row = typeof index === 'number' ? `Role ${index + 1}` : 'A role';
    if (field === 'title') {
      problems.add(
        issue.code === 'too_big'
          ? 'The title is too long (256 characters at most).'
          : 'Give the panel a title.',
      );
    } else if (field === 'description') {
      problems.add('The description is too long (2,000 characters at most).');
    } else if (field === 'options' && part === 'label') {
      problems.add(
        issue.code === 'too_big'
          ? `${row}: the label is too long (80 characters at most).`
          : `${row}: add a label.`,
      );
    } else if (field === 'options' && part === 'emoji') {
      problems.add(`${row}: the emoji is too long. Use one emoji, or <:name:id> for a custom one.`);
    } else if (field === 'options' && part === 'description') {
      problems.add(`${row}: the dropdown description is too long (100 characters at most).`);
    } else if (field === 'options' && part === 'roleId') {
      problems.add(`${row}: pick a role.`);
    } else if (field === 'options' && issue.code === 'too_small') {
      problems.add('Add at least one role. Each row needs both a role and a label.');
    } else if (field === 'options' && issue.code === 'too_big') {
      problems.add('A panel can hold 25 roles at most.');
    } else {
      problems.add(issue.message);
    }
  }
  return [...problems];
}
