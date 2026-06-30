import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRefxAlert,
  fetchRefxNodes,
  formatUptime,
  nodeMetricsLine,
  refxNodeMetricsSchema,
  refxNodesSchema,
  refxStatusEmoji,
  refxStatusSchema,
  refxWebhookSchema,
} from './refx';

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

  it('covers the ReFx status vocabulary (operational|degraded|maintenance|outage)', () => {
    expect(refxStatusEmoji('operational')).toBe('🟢');
    expect(refxStatusEmoji('degraded')).toBe('🟡');
    expect(refxStatusEmoji('maintenance')).toBe('🔵');
    expect(refxStatusEmoji('outage')).toBe('🔴');
  });
});

describe('refxNodesSchema', () => {
  it('parses a full node-metrics payload', () => {
    const parsed = refxNodesSchema.parse({
      success: true,
      data: {
        updatedAt: '2026-06-30T17:32:50.707Z',
        regions: [
          {
            code: 'ca-east',
            name: 'CA east',
            status: 'operational',
            nodesUp: 1,
            nodesTotal: 1,
            nodes: [
              {
                name: 'refx-ca-east-bhs',
                status: 'operational',
                cpuPercent: 31.4,
                memoryUsedMb: 18342,
                memoryTotalMb: 65536,
                diskPercent: 22.9,
                serversOnline: 12,
                serversMax: 40,
                uptimeSeconds: 1843200,
              },
            ],
          },
        ],
      },
    });
    expect(parsed.data.regions[0]?.nodes[0]?.cpuPercent).toBe(31.4);
  });

  it('tolerates a node with only partial metrics', () => {
    const parsed = refxNodesSchema.parse({
      data: {
        regions: [
          {
            code: 'x',
            name: 'X',
            status: 'up',
            nodes: [{ name: 'n', status: 'up', cpuPercent: 5 }],
          },
        ],
      },
    });
    const node = parsed.data.regions[0]?.nodes[0];
    expect(node?.cpuPercent).toBe(5);
    expect(node?.memoryPercent).toBeUndefined();
  });
});

describe('fetchRefxNodes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns null and makes no request without a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchRefxNodes(undefined)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null on 401/403 without consuming the error body (silent fallback)', async () => {
    // Real backend error bodies; we must short-circuit on the status code and
    // never read the body, so a wrong/unscoped token degrades to the public feed.
    const json401 = vi.fn(async () => ({
      statusCode: 401,
      message: 'A status:read API token is required',
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: json401 })),
    );
    expect(await fetchRefxNodes('t')).toBeNull();
    expect(json401).not.toHaveBeenCalled();

    const json403 = vi.fn(async () => ({
      statusCode: 403,
      message: 'Token lacks the status:read scope',
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 403, json: json403 })),
    );
    expect(await fetchRefxNodes('t')).toBeNull();
    expect(json403).not.toHaveBeenCalled();
  });

  it('parses a 200 payload and throws on 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { regions: [] } }) })),
    );
    const result = await fetchRefxNodes('t');
    expect(result?.data.regions).toEqual([]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 })),
    );
    await expect(fetchRefxNodes('t')).rejects.toThrow();
  });
});

describe('refx metric formatting', () => {
  it('formats uptime compactly', () => {
    expect(formatUptime(0)).toBe('0m');
    expect(formatUptime(1843200)).toBe('21d 8h');
    expect(formatUptime(3700)).toBe('1h 1m');
    expect(formatUptime(120)).toBe('2m');
  });

  it('builds a node metrics line and derives missing percentages', () => {
    expect(nodeMetricsLine({ name: 'n', status: 'up' })).toBe('');
    const line = nodeMetricsLine({
      name: 'n',
      status: 'up',
      cpuPercent: 30,
      memoryUsedMb: 1000,
      memoryTotalMb: 2000,
      serversOnline: 3,
      serversMax: 10,
    });
    expect(line).toContain('CPU 30%');
    expect(line).toContain('RAM 50%');
    expect(line).toContain('3/10 servers');
  });

  it('shows the running server count even without serversMax', () => {
    const line = nodeMetricsLine({ name: 'n', status: 'up', cpuPercent: 9.8, serversOnline: 4 });
    expect(line).toContain('CPU 10%');
    expect(line).toContain('4 servers');
    expect(line).not.toContain('/');
  });

  it('degrades gracefully for a heartbeat-less node (only name/status/serversOnline)', () => {
    // A node that hasn't reported metrics still parses and renders.
    const node = refxNodeMetricsSchema.parse({
      name: 'n',
      status: 'operational',
      serversOnline: 0,
    });
    expect(node.cpuPercent).toBeUndefined();
    expect(nodeMetricsLine(node)).toBe('0 servers');
    // A bare node with no metrics at all renders an empty suffix.
    expect(nodeMetricsLine(refxNodeMetricsSchema.parse({ name: 'n', status: 'operational' }))).toBe(
      '',
    );
  });

  it('keeps zero-valued metrics (0% is not "missing")', () => {
    const line = nodeMetricsLine({
      name: 'n',
      status: 'operational',
      cpuPercent: 0,
      diskPercent: 0,
      serversOnline: 1,
    });
    expect(line).toBe('CPU 0% · Disk 0% · 1 servers');
  });

  it('parses a real GET /api/v1/status/nodes sample and renders every node', () => {
    const sample = {
      success: true,
      data: {
        updatedAt: '2026-06-30T18:42:10.512Z',
        regions: [
          {
            code: 'ca-east',
            name: 'CA east',
            status: 'operational',
            nodesUp: 2,
            nodesTotal: 2,
            nodes: [
              {
                name: 'refx-ca-east-bhs',
                status: 'operational',
                cpuPercent: 31.4,
                memoryUsedMb: 18342,
                memoryTotalMb: 65536,
                memoryPercent: 28,
                diskUsedGb: 220,
                diskTotalGb: 960,
                diskPercent: 23,
                serversOnline: 12,
              },
              {
                name: 'refx-ca-east-bhs1',
                status: 'operational',
                cpuPercent: 9.8,
                memoryUsedMb: 7110,
                memoryTotalMb: 65536,
                memoryPercent: 11,
                diskUsedGb: 96,
                diskTotalGb: 960,
                diskPercent: 10,
                serversOnline: 4,
              },
            ],
          },
        ],
      },
    };
    const parsed = refxNodesSchema.parse(sample);
    const nodes = parsed.data.regions[0]?.nodes ?? [];
    expect(nodes).toHaveLength(2);
    expect(nodeMetricsLine(nodes[0]!)).toBe('CPU 31% · RAM 28% · Disk 23% · 12 servers');
    expect(nodeMetricsLine(nodes[1]!)).toBe('CPU 10% · RAM 11% · Disk 10% · 4 servers');
  });
});

describe('refxWebhookSchema', () => {
  it('accepts each valid event and preserves passthrough fields', () => {
    const incident = refxWebhookSchema.parse({
      event: 'incident.created',
      timestamp: '2026-06-30T00:00:00Z',
      data: { id: 'i1', title: 'DB down', severity: 'major', extra: 'kept' },
    });
    expect(incident.event).toBe('incident.created');
    expect((incident.data as Record<string, unknown>).extra).toBe('kept');

    const component = refxWebhookSchema.parse({
      event: 'component.status_changed',
      timestamp: '2026-06-30T00:00:00Z',
      data: { key: 'nodes', name: 'Nodes', status: 'degraded' },
    });
    expect(component.event).toBe('component.status_changed');
  });

  it('rejects unknown events, missing timestamp, and non-object data', () => {
    expect(
      refxWebhookSchema.safeParse({ event: 'nope', timestamp: 'x', data: { id: 'i' } }).success,
    ).toBe(false);
    expect(
      refxWebhookSchema.safeParse({ event: 'incident.created', data: { id: 'i' } }).success,
    ).toBe(false);
    expect(
      refxWebhookSchema.safeParse({ event: 'incident.created', timestamp: 'x', data: 'nope' })
        .success,
    ).toBe(false);
  });

  it('parses fail-open data so a signed event is never dropped on a renamed/omitted field', () => {
    expect(
      refxWebhookSchema.parse({ event: 'incident.created', timestamp: 't', data: {} }).event,
    ).toBe('incident.created');
    expect(
      refxWebhookSchema.parse({ event: 'component.status_changed', timestamp: 't', data: {} })
        .event,
    ).toBe('component.status_changed');
    // a malformed url is dropped, not fatal
    const parsed = refxWebhookSchema.parse({
      event: 'incident.created',
      timestamp: 't',
      data: { id: 'i', url: 'not a url' },
    });
    expect((parsed.data as Record<string, unknown>).url).toBeUndefined();
  });
});

describe('buildRefxAlert', () => {
  it('renders each event kind', () => {
    expect(buildRefxAlert('incident.created', { title: 'X', severity: 'major' }).kind).toBe(
      'danger',
    );
    expect(buildRefxAlert('incident.resolved', { title: 'X' }).kind).toBe('success');
    expect(
      buildRefxAlert('component.status_changed', { name: 'Nodes', status: 'operational' }).kind,
    ).toBe('success');
    expect(
      buildRefxAlert('component.status_changed', { name: 'Nodes', status: 'major_outage' }).kind,
    ).toBe('warning');
  });
});
