import { describe, expect, it } from 'vitest';
import { rolePanelProblems } from './roles';

const valid = {
  title: 'Pick your region',
  description: null,
  channelId: '123456789012345678',
  mode: 'NORMAL',
  type: 'BUTTON',
  options: [{ roleId: '1', label: 'Europe' }],
};

describe('rolePanelProblems', () => {
  it('is empty for a valid panel', () => {
    expect(rolePanelProblems(valid)).toEqual([]);
  });

  it('asks for a title and at least one role', () => {
    expect(rolePanelProblems({ ...valid, title: '', options: [] })).toEqual([
      'Give the panel a title.',
      'Add at least one role. Each row needs both a role and a label.',
    ]);
  });

  it('points at the row with the problem', () => {
    const problems = rolePanelProblems({
      ...valid,
      options: [
        { roleId: '1', label: 'Europe' },
        { roleId: '2', label: 'x'.repeat(81) },
        { roleId: '3', label: 'Asia', emoji: 'e'.repeat(65) },
      ],
    });
    expect(problems).toEqual([
      'Role 2: the label is too long (80 characters at most).',
      'Role 3: the emoji is too long. Use one emoji, or <:name:id> for a custom one.',
    ]);
  });

  it('reports a role used twice', () => {
    expect(
      rolePanelProblems({
        ...valid,
        options: [
          { roleId: '1', label: 'Europe' },
          { roleId: '1', label: 'EU' },
        ],
      }),
    ).toEqual(['Each role can appear only once per panel.']);
  });
});
