import { describe, expect, it } from 'vitest';
import { DiscordAPIError } from 'discord.js';
import type { RolePanelOption } from '@refx/shared';
import { explainPanelError } from './rolePanelDeploy';

const options: RolePanelOption[] = [
  { roleId: '1', label: 'Twitch', emoji: '💜' },
  { roleId: '2', label: 'TikTok', emoji: ':blue_heart:' },
  { roleId: '3', label: 'Youtube' },
];

function apiError(code: number, message: string, errors?: unknown): DiscordAPIError {
  return new DiscordAPIError(
    { code, message, errors } as never,
    code,
    400,
    'POST',
    '/channels/1/messages',
    {
      files: undefined,
      body: undefined,
    },
  );
}

describe('explainPanelError', () => {
  it('names the option whose emoji Discord rejected', () => {
    const err = apiError(50035, 'Invalid Form Body', {
      components: {
        0: { components: { 1: { emoji: { name: { _errors: [{ message: 'Invalid emoji' }] } } } } },
      },
    });
    const text = explainPanelError(err, options, 'roles');
    expect(text).toContain('rejected the emoji on "TikTok" (:blue_heart:)');
    expect(text).toContain('<:name:id>');
  });

  it('maps a select-menu error path to its option', () => {
    const err = apiError(50035, 'Invalid Form Body', {
      components: {
        0: {
          components: { 0: { options: { 2: { label: { _errors: [{ message: 'Too long' }] } } } } },
        },
      },
    });
    expect(explainPanelError(err, options, 'roles')).toBe(
      'Discord rejected the panel at "Youtube": Too long',
    );
  });

  it('explains missing permissions with the channel name', () => {
    const text = explainPanelError(apiError(50013, 'Missing Permissions'), options, 'roles');
    expect(text).toContain('#roles');
    expect(text).toContain('Send Messages');
  });

  it('falls back to Discord’s own message and code', () => {
    expect(explainPanelError(apiError(30003, 'Maximum pins reached'), options, 'roles')).toBe(
      'Discord rejected the panel: Maximum pins reached (code 30003).',
    );
  });

  it('handles non-Discord errors', () => {
    expect(explainPanelError(new Error('socket hang up'), options, 'roles')).toContain(
      'socket hang up',
    );
  });
});
