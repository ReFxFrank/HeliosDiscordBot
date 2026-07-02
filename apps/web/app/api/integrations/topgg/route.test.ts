import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@solari/database';
import { POST } from './route';

const RUN = process.env.VITEST_SKIP_INTEGRATION !== '1';
const suite = RUN ? describe : describe.skip;

const AUTH = 'topgg-route-test-secret';
const USER = `topgg-test-${Date.now()}`;
const URL = 'http://localhost/api/integrations/topgg';

function req(body: unknown, auth?: string): Request {
  return new Request(URL, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: auth } : {}),
    },
  });
}

suite('POST /api/integrations/topgg (integration)', () => {
  beforeAll(() => {
    process.env.TOPGG_WEBHOOK_AUTH = AUTH;
  });

  afterAll(async () => {
    delete process.env.TOPGG_WEBHOOK_AUTH;
    await prisma.topggVote.deleteMany({ where: { userId: USER } });
    await prisma.$disconnect();
  });

  it('fails closed (503) when TOPGG_WEBHOOK_AUTH is unset', async () => {
    delete process.env.TOPGG_WEBHOOK_AUTH;
    const response = await POST(req({ user: USER, type: 'upvote' }, AUTH));
    expect(response.status).toBe(503);
    process.env.TOPGG_WEBHOOK_AUTH = AUTH;
  });

  it('rejects a wrong or missing Authorization header', async () => {
    expect((await POST(req({ user: USER, type: 'upvote' }, 'wrong'))).status).toBe(401);
    expect((await POST(req({ user: USER, type: 'upvote' }))).status).toBe(401);
  });

  it('rejects a malformed payload', async () => {
    expect((await POST(req({ nope: true }, AUTH))).status).toBe(422);
  });

  it('acknowledges a panel test without storing a claimable vote', async () => {
    const response = await POST(req({ user: USER, type: 'test' }, AUTH));
    expect(response.status).toBe(200);
    expect(await prisma.topggVote.count({ where: { userId: USER } })).toBe(0);
  });

  it('stores an upvote with the weekend flag', async () => {
    const response = await POST(req({ user: USER, type: 'upvote', isWeekend: true }, AUTH));
    expect(response.status).toBe(200);
    const vote = await prisma.topggVote.findFirst({ where: { userId: USER } });
    expect(vote?.isWeekend).toBe(true);
    expect(vote?.claimedGuilds).toEqual([]);
  });
});
