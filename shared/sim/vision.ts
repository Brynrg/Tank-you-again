import {
  PICKUP_PROXIMITY_RADIUS,
  RADAR_DETECT_TICKS,
  RADAR_RADIUS,
  VISION_RADIUS,
  type MineState,
  type PickupState,
  type ProjectileState,
  type TankState,
} from "@shared/types";

export interface VisionSet {
  visibleTankIds: Set<string>;
  visibleMineIds: Set<string>;
  visibleProjectileIds: Set<string>;
  visiblePickupIds: Set<string>;
}

export interface RadarScanResult {
  minesRevealed: number;
  pickupsRevealed: number;
}

/**
 * Compute what `viewer` can see of the world right now.
 *
 * - Tanks/projectiles: within VISION_RADIUS of the viewer.
 * - Mines: own, ally, or explicitly radar-revealed for this viewer.
 * - Pickups: close proximity or explicitly radar-revealed for this viewer.
 *
 * Allies are always visible regardless of distance (team-wide intel).
 */
export function computeVisionSet(
  viewer: TankState,
  world: {
    tanks: readonly TankState[];
    projectiles: readonly ProjectileState[];
    mines: readonly MineState[];
    pickups: readonly PickupState[];
    radarReveals: Map<string, number>;
  },
  currentTick: number,
): VisionSet {
  const v2 = VISION_RADIUS * VISION_RADIUS;
  const pickupProximity2 = PICKUP_PROXIMITY_RADIUS * PICKUP_PROXIMITY_RADIUS;

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
    if (
      dx * dx + dy * dy <= pickupProximity2 ||
      isRadarRevealed(pk.id, world.radarReveals, currentTick)
    ) {
      visiblePickupIds.add(pk.id);
    }
  }

  const visibleMineIds = new Set<string>();
  for (const m of world.mines) {
    if (isMineVisible(m, viewer, world.radarReveals, currentTick)) {
      visibleMineIds.add(m.id);
    }
  }

  return { visibleTankIds, visibleMineIds, visibleProjectileIds, visiblePickupIds };
}

export function isMineVisible(
  mine: MineState,
  viewer: TankState,
  radarReveals: Map<string, number>,
  currentTick: number,
): boolean {
  if (mine.ownerId === viewer.id) return true;
  if (mine.ownerTeam === viewer.team) return true;
  return isRadarRevealed(mine.id, radarReveals, currentTick);
}

export function isRadarRevealed(
  entityId: string,
  radarReveals: Map<string, number>,
  currentTick: number,
): boolean {
  const lastDetectedTick = radarReveals.get(entityId);
  return lastDetectedTick !== undefined && currentTick - lastDetectedTick < RADAR_DETECT_TICKS;
}

/**
 * Active radar scan. Mutates the caller-provided per-viewer reveal map.
 * Reveals nearby enemy mines and all nearby pickups for RADAR_DETECT_TICKS.
 */
export function scanRadar(
  viewer: TankState,
  world: {
    mines: readonly MineState[];
    pickups: readonly PickupState[];
  },
  radarReveals: Map<string, number>,
  currentTick: number,
): RadarScanResult {
  const r2 = RADAR_RADIUS * RADAR_RADIUS;
  let minesRevealed = 0;
  let pickupsRevealed = 0;

  for (const mine of world.mines) {
    if (mine.ownerTeam === viewer.team) continue;
    const dx = mine.x - viewer.x;
    const dy = mine.y - viewer.y;
    if (dx * dx + dy * dy <= r2) {
      radarReveals.set(mine.id, currentTick);
      minesRevealed += 1;
    }
  }

  for (const pickup of world.pickups) {
    const dx = pickup.x - viewer.x;
    const dy = pickup.y - viewer.y;
    if (dx * dx + dy * dy <= r2) {
      radarReveals.set(pickup.id, currentTick);
      pickupsRevealed += 1;
    }
  }

  return { minesRevealed, pickupsRevealed };
}
