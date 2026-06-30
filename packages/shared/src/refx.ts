import { z } from 'zod';

/**
 * ReFx Hosting (refx.gg) public status feed. The panel API exposes an
 * unauthenticated `GET /api/v1/status` that reports overall status, per-service
 * components, per-region node counts + node status, and incidents — everything
 * needed to surface infra/node health in Discord, no API key required.
 */
export const DEFAULT_REFX_STATUS_URL = 'https://api.refx.gg/api/v1/status';

export const refxComponentSchema = z.object({
  key: z.string(),
  name: z.string(),
  status: z.string(),
});

export const refxNodeSchema = z.object({
  name: z.string(),
  status: z.string(),
});

export const refxRegionSchema = z.object({
  code: z.string(),
  name: z.string(),
  country: z.string().optional(),
  status: z.string(),
  nodesUp: z.number().int().default(0),
  nodesTotal: z.number().int().default(0),
  nodes: z.array(refxNodeSchema).default([]),
});

export const refxIncidentSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().optional(),
    status: z.string().optional(),
    severity: z.string().optional(),
  })
  .passthrough();

export const refxStatusSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    status: z.string(),
    updatedAt: z.string().optional(),
    components: z.array(refxComponentSchema).default([]),
    regions: z.array(refxRegionSchema).default([]),
    incidents: z
      .object({
        active: z.array(refxIncidentSchema).default([]),
        recent: z.array(refxIncidentSchema).default([]),
      })
      .default({ active: [], recent: [] }),
  }),
});

export type RefxStatus = z.infer<typeof refxStatusSchema>;
export type RefxStatusData = RefxStatus['data'];
export type RefxRegion = z.infer<typeof refxRegionSchema>;

/** Fetch + validate the ReFx status feed. Throws on network/parse failure. */
export async function fetchRefxStatus(url: string = DEFAULT_REFX_STATUS_URL): Promise<RefxStatus> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`ReFx status fetch failed (${response.status})`);
  return refxStatusSchema.parse(await response.json());
}

/** Map a status string to a traffic-light emoji for embeds. */
export function refxStatusEmoji(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('operational') || normalized === 'up' || normalized === 'ok') return '🟢';
  if (normalized.includes('maintenance')) return '🔵';
  if (normalized.includes('degraded') || normalized.includes('partial')) return '🟡';
  return '🔴';
}
