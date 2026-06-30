import { describe, expect, it } from 'vitest';
import { refxStatusEmoji, refxStatusSchema } from './refx';

// A real sample from GET https://api.refx.gg/api/v1/status.
const sample = {
  success: true,
  data: {
    status: 'operational',
    updatedAt: '2026-06-30T17:32:50.707Z',
    components: [
      { key: 'panel-api', name: 'Control Panel API', status: 'operational' },
      { key: 'nodes', name: 'Game Server Nodes', status: 'operational' },
    ],
    regions: [
      {
        code: 'ca-east',
        name: 'CA east',
        country: 'CA',
        status: 'operational',
        nodesUp: 2,
        nodesTotal: 2,
        nodes: [
          { name: 'refx-ca-east-bhs', status: 'operational' },
          { name: 'refx-ca-east-bhs1', status: 'operational' },
        ],
      },
    ],
    incidents: { active: [], recent: [] },
  },
};

describe('refxStatusSchema', () => {
  it('parses the live status payload', () => {
    const parsed = refxStatusSchema.parse(sample);
    expect(parsed.data.status).toBe('operational');
    expect(parsed.data.regions[0]?.nodesUp).toBe(2);
    expect(parsed.data.regions[0]?.nodes).toHaveLength(2);
  });

  it('fills defaults for a minimal payload', () => {
    const parsed = refxStatusSchema.parse({ data: { status: 'operational' } });
    expect(parsed.data.components).toEqual([]);
    expect(parsed.data.incidents.active).toEqual([]);
  });
});

describe('refxStatusEmoji', () => {
  it('maps status strings to traffic lights', () => {
    expect(refxStatusEmoji('operational')).toBe('🟢');
    expect(refxStatusEmoji('maintenance')).toBe('🔵');
    expect(refxStatusEmoji('degraded_performance')).toBe('🟡');
    expect(refxStatusEmoji('major_outage')).toBe('🔴');
  });
});
