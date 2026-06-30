import { z } from 'zod';

export const inviteTrackingConfigSchema = z.object({
  /** Channel that logs "X joined, invited by Y". Optional. */
  logChannelId: z.string().nullable().default(null),
});

export type InviteTrackingConfig = z.infer<typeof inviteTrackingConfigSchema>;

export interface InviteSnapshot {
  code: string;
  uses: number;
  inviterId: string | null;
}

export interface ResolvedInvite {
  code: string;
  inviterId: string | null;
}

/**
 * Determine which invite was used for a join by diffing the before/after invite
 * snapshots. Pure so the (fiddly) edge cases are unit-testable:
 *  - an invite whose use count incremented is the used one;
 *  - a single-use invite that hit its cap is deleted on use, so it's present in
 *    `before` but absent from `after` — if exactly one such invite vanished and
 *    nothing else incremented, attribute the join to it;
 *  - ambiguous (none/multiple candidates) → null (unknown inviter).
 */
export function diffInviteUse(
  before: InviteSnapshot[],
  after: InviteSnapshot[],
): ResolvedInvite | null {
  const beforeByCode = new Map(before.map((invite) => [invite.code, invite]));
  const afterByCode = new Map(after.map((invite) => [invite.code, invite]));

  const incremented = after.filter(
    (invite) => invite.uses > (beforeByCode.get(invite.code)?.uses ?? 0),
  );
  if (incremented.length === 1) {
    const used = incremented[0]!;
    return { code: used.code, inviterId: used.inviterId };
  }
  if (incremented.length > 1) return null; // can't disambiguate concurrent joins

  // Nothing incremented — look for a single invite that disappeared (maxed out).
  const vanished = before.filter((invite) => !afterByCode.has(invite.code));
  if (vanished.length === 1) {
    const used = vanished[0]!;
    return { code: used.code, inviterId: used.inviterId };
  }
  return null;
}
