import {
  RADAR_DETECT_TICKS,
  RADAR_RADIUS,
  VISION_RADIUS,
  type MineState,
  type ProjectileState,
  type TankState,
} from "@shared/types";

export interface VisionSet {
  visibleTankIds: Set<string>;
  visibleMineIds: Set<string>;
  visibleProjectileIds: Set<string>;
  visiblePickupIds: Set<string>;
}

/**
 * Compute what `viewer` can see of the world right now.
 *
 * - Tanks/projectiles: within VISION_RADIUS of the viewer.
 * - Mines: see `isMineVisible` — own, ally, or radar-detected.
 * - Pickups: within VISION_RADIUS (same rule as tanks).
 *
 * Allies are always visible regardless of distance (team-wide intel).
 */
export function computeVisionSet(
  viewer: TankState,
  world: {
    tanks: Iterable<TankState>;
    projectiles: Iterable<ProjectileState>;
    mines: Iterable<MineState>;
    pickups: Iterable<{ id: string; x: number; y: number }>;
    radarSweeps: Map<string, number>; // mineId -> lastDetectedTick
  },
  currentTick: number,
): VisionSet {
  const v2 = VISION_RADIUS * VISION_RADIUS;

  const visibleTankIds = new Set<string>();
  for (const t of world.tanks) {
    if (t.id === viewer.id) {
      visibleTankIds.add(t.id);
      continue;
    }
    if (t.team === viewer.team) {
      visibleTankIds.add(t.id);
      continue;
    }
    const dx = t.x - viewer.x;
    const dy = t.y - viewer.y;
    if (dx * dx + dy * dy <= v2) visibleTankIds.add(t.id);
  }

  const visibleProjectileIds = new Set<string>();
  for (const p of world.projectiles) {
    const dx = p.x - viewer.x;
    const dy = p.y - viewer.y;
    if (dx * dx + dy * dy <= v2) visibleProjectileIds.add(p.id);
  }

  const visiblePickupIds = new Set<string>();
  for (const pk of world.pickups) {
    const dx = pk.x - viewer.x;
    const dy = pk.y - viewer.y;
    if (dx * dx + dy * dy <= v2) visiblePickupIds.add(pk.id);
  }

  // Mines: per the masking rule, can ONLY include own, ally, or radar-detected.
  const visibleMineIds = new Set<string>();
  for (const m of world.mines) {
    if (isMineVisible(m, viewer, world.radarSweeps, currentTick)) {
      visibleMineIds.add(m.id);
    }
  }

  return { visibleTankIds, visibleMineIds, visibleProjectileIds, visiblePickupIds };
}

/**
 * A mine is visible to `viewer` iff:
 *   1. viewer.id === mine.ownerId        (own mine)
 *   2. viewer.team === mine.ownerTeam    (ally mine)
 *   3. mine was detected by viewer's radar in the last RADAR_DETECT_TICKS ticks
 *
 * Otherwise the mine MUST be absent from the snapshot entirely — clients
 * must not be able to infer hidden mines from snapshot payload size.
 *
 * Note: radar reveal is per-mine, not per-viewer (any tank's sweep reveals
 * the mine to the whole world). This is a deliberate simplification — proper
 * per-viewer reveal would mean a Map<mineId, Map<viewerId, tick>>.
 */
export function isMineVisible(
  mine: MineState,
  viewer: TankState,
  radarSweeps: Map<string, number>,
  currentTick: number,
): boolean {
  if (mine.ownerId === viewer.id) return true;
  if (mine.ownerTeam === viewer.team) return true;
  const lastDetectedTick = radarSweeps.get(mine.id);
  if (lastDetectedTick !== undefined && currentTick - lastDetectedTick < RADAR_DETECT_TICKS) {
    return true;
  }
  return false;
}

/**
 * On each tick, any enemy mine within RADAR_RADIUS of any non-dead tank
 * registers a sweep — stamping `radarSweeps[mineId] = currentTick`. The mine
 * stays revealed for RADAR_DETECT_TICKS after the last sweep.
 *
 * Caller passes the working `radarSweeps` map — this mutates it.
 */
export function stepRadarSweeps(
  mines: Iterable<MineState>,
  tanks: Iterable<TankState>,
  radarSweeps: Map<string, number>,
  currentTick: number,
): void {
  const r2 = RADAR_RADIUS * RADAR_RADIUS;
  const tanksArr = [...tanks];
  for (const m of mines) {
    for (const t of tanksArr) {
      if (t.isDead) continue;
      if (t.team === m.ownerTeam) continue; // allies don't reveal own-team mines
      const dx = t.x - m.x;
      const dy = t.y - m.y;
      if (dx * dx + dy * dy <= r2) {
        radarSweeps.set(m.id, currentTick);
        break;
      }
    }
  }
}
