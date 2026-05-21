import type { PrismaClient, Tank, User } from "@prisma/client";

import { MilitaryRank } from "@shared/types";

import { validateUsername } from "./lib/validation.js";

export type AuthResult =
  | { ok: true; user: User; tank: Tank }
  | { ok: false; reason: string };

/**
 * Resolve an inbound AUTH message into a `{ user, tank }` pair.
 *
 * Today this only supports the guest flow:
 *   - `guestName` (after validateUsername) → create User { isGuest: true } and
 *     a fresh Tank row at RECRUIT.
 *
 * Registered-user auth is a P1 follow-up — see `IMPROVEMENT_PLAN.md P1-1`.
 * `token` is accepted but unused; we return a clear error so the client knows
 * to fall back to guest.
 */
export async function handleAuth(
  prisma: PrismaClient,
  msg: { token?: string; guestName?: string },
): Promise<AuthResult> {
  if (msg.token) {
    return { ok: false, reason: "token auth not yet supported — send guestName" };
  }
  const v = validateUsername(msg.guestName);
  if (!v.ok) return { ok: false, reason: v.reason };
  const name = v.value;

  try {
    const user = await prisma.user.create({
      data: {
        isGuest: true,
      },
    });
    const tank = await prisma.tank.create({
      data: {
        userId: user.id,
        name,
        rank: MilitaryRank.RECRUIT,
        highestRank: MilitaryRank.RECRUIT,
      },
    });
    return { ok: true, user, tank };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `auth/persist failed: ${msg}` };
  }
}
