import { z } from 'zod';

/** Discord allows five inputs in one pop-up form. */
export const TICKET_QUESTIONS_MAX = 5;
/** Two rows of five buttons; a dropdown could hold more, but one limit keeps the panel swappable. */
export const TICKET_TYPES_MAX = 10;
export const TICKET_BLOCKED_MAX = 500;
/** Used for the channel name when nothing else is set. */
export const TICKET_DEFAULT_NAME_PATTERN = 'ticket-{number}';
/** The id of the single built-in ticket type used when no types are configured. */
export const TICKET_DEFAULT_TYPE_ID = 'default';

/** A question asked in the pop-up form before the ticket is created. */
export const ticketQuestionSchema = z.object({
  /** Discord caps a form label at 45 characters. */
  label: z.string().min(1).max(45),
  placeholder: z.string().max(100).default(''),
  /** A multi-line answer box rather than a single line. */
  long: z.boolean().default(false),
  required: z.boolean().default(true),
});
export type TicketQuestion = z.infer<typeof ticketQuestionSchema>;

/**
 * One kind of ticket on the panel (Support, Report, Appeal…). Anything left
 * blank falls back to the server-wide setting of the same name.
 */
export const ticketTypeSchema = z.object({
  /** Stable short id; it is part of the panel button, so it must not change. */
  id: z.string().regex(/^[a-z0-9-]{1,24}$/),
  label: z.string().min(1).max(80),
  emoji: z.string().max(64).default(''),
  /** Shown under the label when the panel is a dropdown. */
  description: z.string().max(100).default(''),
  categoryId: z.string().nullable().default(null),
  supportRoleIds: z.array(z.string()).default([]),
  namePattern: z.string().max(60).default(''),
  openMessage: z.string().max(1500).default(''),
  questions: z.array(ticketQuestionSchema).max(TICKET_QUESTIONS_MAX).default([]),
});
export type TicketType = z.infer<typeof ticketTypeSchema>;

export const ticketsConfigSchema = z
  .object({
    /** Category new ticket channels are created under. Required to open tickets. */
    categoryId: z.string().nullable().default(null),
    /** Roles granted access to every ticket channel. */
    supportRoleIds: z.array(z.string()).default([]),
    /** Where closed-ticket transcripts are posted (blank = no transcript). */
    transcriptChannelId: z.string().nullable().default(null),
    /** Channel the "Open a ticket" panel is deployed to from the dashboard. */
    panelChannelId: z.string().nullable().default(null),
    panelTitle: z.string().max(256).default('Need help?'),
    panelDescription: z
      .string()
      .max(2000)
      .default('Click the button below to open a private support ticket.'),
    /** Buttons (one per type) or a single dropdown listing the types. */
    panelStyle: z.enum(['BUTTONS', 'DROPDOWN']).default('BUTTONS'),
    /** Label of the single button used when no ticket types are configured. */
    buttonLabel: z.string().min(1).max(80).default('Open a ticket'),
    openMessage: z
      .string()
      .max(1500)
      .default('Thanks for opening a ticket — support will be with you shortly.'),
    /** Channel name: {number}, {username} and {type} are filled in. */
    namePattern: z.string().max(60).default(TICKET_DEFAULT_NAME_PATTERN),
    /** Questions for the built-in ticket (used only when no types are configured). */
    questions: z.array(ticketQuestionSchema).max(TICKET_QUESTIONS_MAX).default([]),
    /** The kinds of ticket on the panel. Empty = one built-in ticket. */
    types: z.array(ticketTypeSchema).max(TICKET_TYPES_MAX).default([]),
    maxOpenPerUser: z.number().int().min(1).max(10).default(1),
    /** Hours of inactivity before a ticket auto-closes. 0 disables auto-close. */
    autoCloseHours: z.number().int().min(0).max(720).default(0),
    /** Mention the support roles when a ticket opens. */
    pingSupport: z.boolean().default(true),
    /** Only staff may close; a member's Close press becomes a request to staff. */
    staffOnlyClose: z.boolean().default(true),
    /** DM the member a closing note with the transcript attached. */
    dmTranscript: z.boolean().default(true),
    /** Members who may not open tickets. */
    blockedUserIds: z.array(z.string()).max(TICKET_BLOCKED_MAX).default([]),
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>();
    config.types.forEach((type, index) => {
      if (seen.has(type.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['types', index, 'id'],
          message: 'Two ticket types share the same id.',
        });
      }
      seen.add(type.id);
    });
  });

export type TicketsConfig = z.infer<typeof ticketsConfigSchema>;

/** A ticket type with every fallback already applied. */
export interface ResolvedTicketType {
  id: string;
  label: string;
  emoji: string;
  description: string;
  categoryId: string | null;
  supportRoleIds: string[];
  namePattern: string;
  openMessage: string;
  questions: TicketQuestion[];
}

function resolveType(config: TicketsConfig, type: TicketType): ResolvedTicketType {
  return {
    id: type.id,
    label: type.label,
    emoji: type.emoji,
    description: type.description,
    categoryId: type.categoryId ?? config.categoryId,
    supportRoleIds: type.supportRoleIds.length > 0 ? type.supportRoleIds : config.supportRoleIds,
    namePattern: type.namePattern || config.namePattern || TICKET_DEFAULT_NAME_PATTERN,
    openMessage: type.openMessage || config.openMessage,
    questions: type.questions,
  };
}

/** The ticket types a member can pick from: the configured ones, or the one built-in ticket. */
export function listTicketTypes(config: TicketsConfig): ResolvedTicketType[] {
  if (config.types.length > 0) return config.types.map((type) => resolveType(config, type));
  return [
    {
      id: TICKET_DEFAULT_TYPE_ID,
      label: config.buttonLabel,
      emoji: '🎫',
      description: '',
      categoryId: config.categoryId,
      supportRoleIds: config.supportRoleIds,
      namePattern: config.namePattern || TICKET_DEFAULT_NAME_PATTERN,
      openMessage: config.openMessage,
      questions: config.questions,
    },
  ];
}

/**
 * Look up a ticket type by id. No id (an old panel button, or a ticket opened
 * before types existed) means the first type. An id that no longer exists
 * returns null, so the caller can say the panel is out of date.
 */
export function findTicketType(
  config: TicketsConfig,
  typeId: string | null | undefined,
): ResolvedTicketType | null {
  const types = listTicketTypes(config);
  if (!typeId || typeId === TICKET_DEFAULT_TYPE_ID) return types[0] ?? null;
  return types.find((type) => type.id === typeId) ?? null;
}

/** Every role that counts as ticket staff for a type (falls back to the server-wide roles). */
export function ticketStaffRoleIds(
  config: TicketsConfig,
  typeId: string | null | undefined,
): string[] {
  return findTicketType(config, typeId)?.supportRoleIds ?? config.supportRoleIds;
}

/**
 * Turn a name pattern into a channel name Discord will accept: lower case,
 * letters/digits/dashes/underscores only, at most 90 characters. `{number}` is
 * zero-padded to four digits. Falls back to `ticket-0001` style when the
 * result would be empty (for example a username made only of symbols).
 */
export function renderTicketChannelName(
  pattern: string,
  values: { number: number; username: string; type: string },
): string {
  const padded = String(values.number).padStart(4, '0');
  const clean = (text: string): string =>
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9_ -]+/g, '')
      .trim()
      .replace(/[ -]+/g, '-');
  const filled = (pattern || TICKET_DEFAULT_NAME_PATTERN)
    .replaceAll('{number}', padded)
    .replaceAll('{username}', clean(values.username) || 'member')
    .replaceAll('{type}', clean(values.type) || 'ticket');
  const name = clean(filled)
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return name || `ticket-${padded}`;
}

/** Make a ticket-type id from its label (`Report a player` → `report-a-player`). */
export function ticketTypeIdFromLabel(label: string, taken: readonly string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20) || 'type';
  if (!taken.includes(base) && base !== TICKET_DEFAULT_TYPE_ID) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-3)}`;
}

/**
 * Plain-language reasons a Tickets config would be rejected, for the dashboard
 * to show before saving (the schema alone only says "invalid").
 */
export function ticketsConfigProblems(input: TicketsConfig): string[] {
  const problems: string[] = [];
  if (!input.buttonLabel.trim()) problems.push('Give the panel button a label.');
  const checkQuestions = (questions: TicketQuestion[], where: string): void => {
    questions.forEach((question, index) => {
      if (!question.label.trim()) problems.push(`${where}: question ${index + 1} needs some text.`);
      else if (question.label.length > 45) {
        problems.push(`${where}: question ${index + 1} is longer than Discord's 45 characters.`);
      }
    });
    if (questions.length > TICKET_QUESTIONS_MAX) {
      problems.push(`${where}: Discord allows at most ${TICKET_QUESTIONS_MAX} questions.`);
    }
  };
  checkQuestions(input.questions, 'Opening questions');
  const ids = new Set<string>();
  input.types.forEach((type, index) => {
    const name = type.label.trim() || `Ticket type ${index + 1}`;
    if (!type.label.trim()) problems.push(`Ticket type ${index + 1} needs a label.`);
    if (ids.has(type.id)) problems.push(`"${name}" has the same id as another type.`);
    ids.add(type.id);
    if (!(type.categoryId ?? input.categoryId)) {
      problems.push(`"${name}" has no category, and no default category is set.`);
    }
    checkQuestions(type.questions, `"${name}"`);
  });
  if (input.types.length > TICKET_TYPES_MAX) {
    problems.push(`At most ${TICKET_TYPES_MAX} ticket types fit on one panel.`);
  }
  const badId = input.blockedUserIds.find((id) => !/^\d{15,22}$/.test(id));
  if (badId) {
    problems.push(`Blocked members: "${badId}" is not a Discord user ID (a long number).`);
  }
  if (problems.length === 0 && !ticketsConfigSchema.safeParse(input).success) {
    problems.push('Some values are out of range. Check the numbers and lengths.');
  }
  return problems;
}
