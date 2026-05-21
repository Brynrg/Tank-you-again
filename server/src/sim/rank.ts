import {
  MilitaryRank,
  RANK_ORDER,
  RANK_XP_THRESHOLDS,
} from "@shared/types";

export interface RankableTank {
  rank: string;
  xp: number;
  highestRank: string;
}

/** Pick the highest rank whose XP threshold is <= current xp. */
export function rankForXp(xp: number): MilitaryRank {
  let chosen: MilitaryRank = MilitaryRank.RECRUIT;
  for (const r of RANK_ORDER) {
    const threshold = RANK_XP_THRESHOLDS[r];
    if (xp >= threshold) chosen = r;
    else break;
  }
  return chosen;
}

/** Index of `rank` in RANK_ORDER, or -1 if not a valid rank string. */
export function rankIndex(rank: string): number {
  return RANK_ORDER.indexOf(rank as MilitaryRank);
}

/**
 * Mutate `tank.xp` by `delta`. Recompute `rank`. Floor at the XP threshold of
 * `highestRank` (so the player never demotes below their best-ever rank).
 * Ratchet `highestRank` upward.
 *
 * Returns true if the visible `rank` field changed.
 */
export function applyXpDelta(tank: RankableTank, delta: number): boolean {
  const oldRank = tank.rank;

  const highestIdx = Math.max(0, rankIndex(tank.highestRank));
  const highest = RANK_ORDER[highestIdx] ?? MilitaryRank.RECRUIT;
  const floor = RANK_XP_THRESHOLDS[highest];

  let nextXp = tank.xp + delta;
  if (nextXp < floor) nextXp = floor;
  tank.xp = nextXp;

  const newRank = rankForXp(tank.xp);
  tank.rank = newRank;

  const newRankIdx = rankIndex(newRank);
  if (newRankIdx > highestIdx) tank.highestRank = newRank;

  return tank.rank !== oldRank;
}
