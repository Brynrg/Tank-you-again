import { randomId } from "./id.js";

import {
  INITIAL_MINES,
  INITIAL_MISSILES,
  INITIAL_RADAR,
  INITIAL_SHIELDS,
  INITIAL_TELEPORTS,
  ItemType,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_FUEL,
  MilitaryRank,
  PICKUP_MAX_ACTIVE,
  PICKUP_SPAWN_INTERVAL_TICKS,
  SPAWN_FUEL,
  SPAWN_PROTECTION_TICKS,
  TANK_RADIUS,
  TeamColor,
  type PickupState,
  type TankState,
} from "@shared/types";

const TEAMS: TeamColor[] = [TeamColor.BLUE, TeamColor.RED, TeamColor.ORANGE, TeamColor.PURPLE];

/** Round-robin team picker, balanced by current census. */
export function pickTeam(census: Map<TeamColor, number>): TeamColor {
  let best: TeamColor = TeamColor.BLUE;
  let bestCount = Infinity;
  for (const t of TEAMS) {
    const c = census.get(t) ?? 0;
    if (c < bestCount) {
      bestCount = c;
      best = t;
    }
  }
  return best;
}

/** Random spawn point not too close to the edges. */
export function pickSpawnPoint(): { x: number; y: number } {
  const margin = TANK_RADIUS * 4;
  return {
    x: margin + Math.random() * (MAP_WIDTH - margin * 2),
    y: margin + Math.random() * (MAP_HEIGHT - margin * 2),
  };
}

/** Construct a freshly-spawned tank with full fuel and starter ammo. */
export function makeTank(args: {
  id: string;
  name: string;
  team: TeamColor;
  rank: MilitaryRank;
  currentTick: number;
}): TankState {
  const spawn = pickSpawnPoint();
  return {
    id: args.id,
    name: args.name,
    team: args.team,
    rank: args.rank,
    x: spawn.x,
    y: spawn.y,
    angle: 0,
    turretAngle: 0,
    fuel: SPAWN_FUEL,
    hasShield: false,
    ammo: {
      missiles: INITIAL_MISSILES,
      mines: INITIAL_MINES,
      teleports: INITIAL_TELEPORTS,
      shields: INITIAL_SHIELDS,
      radar: INITIAL_RADAR,
    },
    isSpawnProtected: true,
    spawnProtectedUntilTick: args.currentTick + SPAWN_PROTECTION_TICKS,
    isDead: false,
    respawnAtTick: 0,
    armor: { front: 100, side: 100, rear: 100 },
  };
}

/**
 * Respawn an existing tank in-place. Resets fuel/ammo/position/protection
 * but leaves `id`, `name`, `team`, `rank` alone.
 */
export function respawnTank(t: TankState, currentTick: number): void {
  const spawn = pickSpawnPoint();
  t.x = spawn.x;
  t.y = spawn.y;
  t.angle = 0;
  t.turretAngle = 0;
  t.fuel = SPAWN_FUEL * 0.6;
  t.hasShield = false;
  t.ammo = {
    missiles: Math.max(2, Math.floor(INITIAL_MISSILES / 2)),
    mines: Math.max(2, Math.floor(INITIAL_MINES / 2)),
    teleports: 0,
    shields: 1,
    radar: 1,
  };
  t.isSpawnProtected = true;
  t.spawnProtectedUntilTick = currentTick + SPAWN_PROTECTION_TICKS;
  t.isDead = false;
  t.respawnAtTick = 0;
}

/** Lift spawn protection if the tick has passed. Returns true if newly expired. */
export function tickSpawnProtection(t: TankState, currentTick: number): boolean {
  if (!t.isSpawnProtected) return false;
  if (currentTick >= t.spawnProtectedUntilTick) {
    t.isSpawnProtected = false;
    return true;
  }
  return false;
}

/** Maybe spawn a new pickup if it's time and we're under the cap. */
export function maybeSpawnPickup(
  pickups: Map<string, PickupState>,
  currentTick: number,
  lastSpawnTickRef: { value: number },
): PickupState | null {
  if (pickups.size >= PICKUP_MAX_ACTIVE) return null;
  if (currentTick - lastSpawnTickRef.value < PICKUP_SPAWN_INTERVAL_TICKS) return null;
  lastSpawnTickRef.value = currentTick;

  const types: ItemType[] = [
    ItemType.FUEL_CRATE,
    ItemType.FUEL_CRATE,
    ItemType.FUEL_CRATE, // bias toward fuel
    ItemType.MISSILE,
    ItemType.MINE_PACK,
    ItemType.RADAR,
    ItemType.SHIELD,
    ItemType.TELEPORT_CHARGE,
  ];
  const type = types[Math.floor(Math.random() * types.length)] ?? ItemType.FUEL_CRATE;
  const margin = TANK_RADIUS * 4;
  const pickup: PickupState = {
    id: randomId(),
    type,
    x: margin + Math.random() * (MAP_WIDTH - margin * 2),
    y: margin + Math.random() * (MAP_HEIGHT - margin * 2),
  };
  pickups.set(pickup.id, pickup);
  return pickup;
}

/** Restore a tank toward MAX_FUEL but clamp. */
export function refuelTank(t: TankState, amount: number): void {
  t.fuel = Math.min(MAX_FUEL, t.fuel + amount);
}
