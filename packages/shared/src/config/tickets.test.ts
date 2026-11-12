import { describe, expect, it } from 'vitest';
import {
  findTicketType,
  listTicketTypes,
  renderTicketChannelName,
  ticketStaffRoleIds,
  ticketTypeIdFromLabel,
  ticketTypeSchema,
  ticketsConfigProblems,
  ticketsConfigSchema,
} from './tickets';

describe('ticketsConfigSchema', () => {
  it('fills sensible defaults from an empty object', () => {
    const config = ticketsConfigSchema.parse({});
    expect(config.categoryId).toBeNull();
    expect(config.supportRoleIds).toEqual([]);
    expect(config.maxOpenPerUser).toBe(1);
    expect(config.autoCloseHours).toBe(0);
    expect(config.buttonLabel.length).toBeGreaterThan(0);
    expect(config.types).toEqual([]);
    expect(config.panelStyle).toBe('BUTTONS');
    expect(config.staffOnlyClose).toBe(true);
    expect(config.dmTranscript).toBe(true);
    expect(config.namePattern).toBe('ticket-{number}');
  });

  it('accepts a full config', () => {
    const config = ticketsConfigSchema.parse({
      categoryId: '123456789012345678',
      supportRoleIds: ['111', '222'],
      transcriptChannelId: '333',
      panelChannelId: '444',
      maxOpenPerUser: 3,
      autoCloseHours: 48,
      buttonLabel: 'Get help',
      types: [{ id: 'report', label: 'Report', questions: [{ label: 'Who?' }] }],
    });
    expect(config.supportRoleIds).toHaveLength(2);
    expect(config.types[0]?.questions[0]).toEqual({
      label: 'Who?',
      placeholder: '',
      long: false,
      required: true,
    });
  });

  it('rejects out-of-range fields and duplicate type ids', () => {
    expect(ticketsConfigSchema.safeParse({ maxOpenPerUser: 0 }).success).toBe(false);
    expect(ticketsConfigSchema.safeParse({ maxOpenPerUser: 99 }).success).toBe(false);
    expect(ticketsConfigSchema.safeParse({ autoCloseHours: -1 }).success).toBe(false);
    expect(ticketsConfigSchema.safeParse({ autoCloseHours: 9999 }).success).toBe(false);
    expect(
      ticketsConfigSchema.safeParse({
        types: [
          { id: 'a', label: 'A' },
          { id: 'a', label: 'B' },
        ],
      }).success,
    ).toBe(false);
    expect(
      ticketsConfigSchema.safeParse({
        questions: Array.from({ length: 6 }, (_, i) => ({ label: `Q${i}` })),
      }).success,
    ).toBe(false);
  });

  it('still reads a config saved before ticket types existed', () => {
    const old = ticketsConfigSchema.parse({
      categoryId: '1',
      supportRoleIds: ['9'],
      buttonLabel: 'Open a ticket',
      openMessage: 'Hi',
      maxOpenPerUser: 1,
      autoCloseHours: 0,
    });
    expect(listTicketTypes(old)).toHaveLength(1);
    expect(findTicketType(old, undefined)?.label).toBe('Open a ticket');
  });
});

describe('ticket types', () => {
  const config = ticketsConfigSchema.parse({
    categoryId: 'cat-default',
    supportRoleIds: ['staff'],
    openMessage: 'Default hello',
    types: [
      { id: 'support', label: 'Support' },
      {
        id: 'report',
        label: 'Report',
        categoryId: 'cat-reports',
        supportRoleIds: ['mods'],
        openMessage: 'Tell us who',
        namePattern: 'report-{number}',
      },
    ],
  });

  it("fills a type's blanks from the server-wide settings", () => {
    const support = findTicketType(config, 'support');
    expect(support?.categoryId).toBe('cat-default');
    expect(support?.supportRoleIds).toEqual(['staff']);
    expect(support?.openMessage).toBe('Default hello');
    expect(support?.namePattern).toBe('ticket-{number}');
  });

  it("keeps a type's own settings", () => {
    const report = findTicketType(config, 'report');
    expect(report?.categoryId).toBe('cat-reports');
    expect(ticketStaffRoleIds(config, 'report')).toEqual(['mods']);
    expect(report?.namePattern).toBe('report-{number}');
  });

  it('treats a missing id as the first type and an unknown one as gone', () => {
    expect(findTicketType(config, null)?.id).toBe('support');
    expect(findTicketType(config, 'default')?.id).toBe('support');
    expect(findTicketType(config, 'removed')).toBeNull();
  });

  it('makes readable, unique ids from labels', () => {
    expect(ticketTypeIdFromLabel('Report a Player!', [])).toBe('report-a-player');
    expect(ticketTypeIdFromLabel('Report', ['report'])).toBe('report-2');
    expect(ticketTypeIdFromLabel('Default', [])).toBe('default-2');
    expect(ticketTypeIdFromLabel('🎉', [])).toBe('type');
  });
});

describe('renderTicketChannelName', () => {
  it('fills in the placeholders and pads the number', () => {
    expect(
      renderTicketChannelName('{type}-{username}-{number}', {
        number: 7,
        username: 'Frank.Gaming',
        type: 'Bug Report',
      }),
    ).toBe('bug-report-frankgaming-0007');
  });

  it('only produces characters Discord allows', () => {
    expect(
      renderTicketChannelName('Ticket For {username}!!', {
        number: 12,
        username: 'Zoë 🐸',
        type: 'x',
      }),
    ).toBe('ticket-for-zoe');
  });

  it('falls back when nothing usable is left', () => {
    expect(renderTicketChannelName('{username}', { number: 3, username: '🐸🐸', type: 'x' })).toBe(
      'member',
    );
    expect(renderTicketChannelName('!!!', { number: 3, username: 'a', type: 'x' })).toBe(
      'ticket-0003',
    );
    expect(renderTicketChannelName('', { number: 42, username: 'a', type: 'x' })).toBe(
      'ticket-0042',
    );
  });
});

describe('ticketsConfigProblems', () => {
  it('passes a good config', () => {
    expect(ticketsConfigProblems(ticketsConfigSchema.parse({ categoryId: '1' }))).toEqual([]);
  });

  it('explains what is wrong in plain words', () => {
    const config = ticketsConfigSchema.parse({});
    const problems = ticketsConfigProblems({
      ...config,
      types: [
        { ...ticketTypeSchema.parse({ id: 'a', label: 'A' }), label: '' },
        {
          ...ticketTypeSchema.parse({ id: 'b', label: 'Report' }),
          questions: [{ label: '', placeholder: '', long: false, required: true }],
        },
      ],
    });
    expect(problems).toContain('Ticket type 1 needs a label.');
    expect(problems).toContain('"Report" has no category, and no default category is set.');
    expect(problems).toContain('"Report": question 1 needs some text.');
  });
});
