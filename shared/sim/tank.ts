import {
  TankState,
  TeamColor,
  MilitaryRank,
  INITIAL_MISSILES,
  INITIAL_MINES,
  INITIAL_TELEPORTS,
  INITIAL_SHIELDS,
  INITIAL_RADAR,
  SPAWN_FUEL,
  SPAWN_PROTECTION_TICKS,
} from "@shared/types";

export function createTank(
  id: string,
  name: string,
  team: TeamColor,
  rank: MilitaryRank,
  x: number,
  y: number,
  angle: number,
): TankState {
  return {
    id,
    name,
    team,
    rank,
    x,
    y,
    angle,
    turretAngle: angle,
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
    spawnProtectedUntilTick: SPAWN_PROTECTION_TICKS,
    isDead: false,
    respawnAtTick: 0,
    armor: {
      front: 100,
      side: 80,
      rear: 60,
    },
  };
}
