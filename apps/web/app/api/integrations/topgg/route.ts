import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@solari/database';

export const dynamic = 'force-dynamic';

/**
 * top.gg vote webhook. Register `https://<domain>/api/integrations/topgg` in
 * the top.gg webhooks panel with an Authorization value matching
 * TOPGG_WEBHOOK_AUTH in .env. Fails closed (503) until that is set. Votes are
 * stored; members claim the economy reward per guild with /vote.
 * Payload: https://docs.top.gg/docs/Resources/webhooks
 */
const voteSchema = z.object({
  user: z.string().min(1),
  type: z.enum(['upvote', 'test']),
  isWeekend: z.boolean().optional(),
  bot: z.string().optional(),
  query: z.string().optional(),
});

/** Constant-time compare of the static Authorization token. */
function authorized(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.TOPGG_WEBHOOK_AUTH;
  if (!secret) {
    return NextResponse.json({ error: 'vote webhook not configured' }, { status: 503 });
  }
  if (!authorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsed: z.infer<typeof voteSchema>;
  try {
    parsed = voteSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 422 });
  }

  // top.gg's "Test" button sends type=test — acknowledge without storing so a
  // panel test can't mint claimable rewards.
  if (parsed.type === 'test') {
    return NextResponse.json({ ok: true, test: true });
  }

  await prisma.topggVote.create({
    data: { userId: parsed.user, isWeekend: parsed.isWeekend ?? false },
  });
  return NextResponse.json({ ok: true });
}
