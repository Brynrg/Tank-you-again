import { randomId } from "./id.js";

import {
  BULLET_COOLDOWN_TICKS,
  BULLET_DAMAGE,
  BULLET_RADIUS,
  BULLET_SPEED,
  BULLET_TTL_TICKS,
  FUEL_FIRE_BULLET,
  FUEL_FIRE_MISSILE,
  MAP_HEIGHT,
  MAP_WIDTH,
  MISSILE_COOLDOWN_TICKS,
  MISSILE_DAMAGE,
  MISSILE_RADIUS,
  MISSILE_SPEED,
  MISSILE_TTL_TICKS,
  ProjectileKind,
  TANK_RADIUS,
  type ProjectileState,
  type TankState,
} from "@shared/types";

import { debitFuel } from "./economy.js";

export interface FireResult {
  ok: boolean;
  projectile?: ProjectileState;
  reason?: string;
}

/**
 * Attempt to fire a weapon from `tank`. On success, returns a fresh
 * `ProjectileState` to be added to the room. On failure (insufficient fuel,
 * out of ammo, on cooldown, dead), returns `{ ok: false, reason }`.
 *
 * `currentTick` is the tick this projectile spawns on. `cooldownLastTick` is
 * the tick of the tank's last fire of this weapon (caller tracks per-conn).
 */
export function tryFire(
  tank: TankState,
  weapon: ProjectileKind,
  aimOverride: number | undefined,
  currentTick: number,
  cooldownLastTick: number,
  damageMult = 1.0,
): FireResult {
  if (tank.isDead) return { ok: false, reason: "dead" };

  const aim = aimOverride ?? tank.turretAngle;

  if (weapon === ProjectileKind.BULLET) {
    if (currentTick - cooldownLastTick < BULLET_COOLDOWN_TICKS) {
      return { ok: false, reason: "cooldown" };
    }
    if (!debitFuel(tank, FUEL_FIRE_BULLET, "FIRE_BULLET")) {
      return { ok: false, reason: "fuel" };
    }
    return {
      ok: true,
      projectile: makeProjectile(
        tank,
        ProjectileKind.BULLET,
        aim,
        BULLET_SPEED,
        BULLET_DAMAGE * damageMult,
        currentTick,
        currentTick + BULLET_TTL_TICKS,
      ),
    };
  }

  // Missile
  if (tank.ammo.missiles <= 0) return { ok: false, reason: "ammo" };
  if (currentTick - cooldownLastTick < MISSILE_COOLDOWN_TICKS) {
    return { ok: false, reason: "cooldown" };
  }
  if (!debitFuel(tank, FUEL_FIRE_MISSILE, "FIRE_MISSILE")) {
    return { ok: false, reason: "fuel" };
  }
  tank.ammo.missiles -= 1;
  return {
    ok: true,
    projectile: makeProjectile(
      tank,
      ProjectileKind.MISSILE,
      aim,
      MISSILE_SPEED,
      MISSILE_DAMAGE * damageMult,
      currentTick,
      currentTick + MISSILE_TTL_TICKS,
    ),
  };
}

function makeProjectile(
  tank: TankState,
  kind: ProjectileKind,
  aim: number,
  speed: number,
  damage: number,
  spawnTick: number,
  expiresAtTick: number,
): ProjectileState {
  // Spawn just outside the tank radius so the projectile doesn't immediately
  // hit-test against its own owner.
  const spawnOffset = TANK_RADIUS + 4;
  const x = tank.x + Math.cos(aim) * spawnOffset;
  const y = tank.y + Math.sin(aim) * spawnOffset;
  const vx = Math.cos(aim) * speed;
  const vy = Math.sin(aim) * speed;
  return {
    id: randomId(),
    ownerId: tank.id,
    kind,
    x,
    y,
    vx,
    vy,
    damage,
    spawnTick,
    expiresAtTick,
  };
}

/**
 * Advance a projectile one tick. Returns true if the projectile should be
 * kept; false if it's off-map or expired (caller should drop it).
 *
 * This does NOT do hit detection — that's `findHit` (called per-tank by the
 * room loop after stepping the projectile).
 */
export function stepProjectile(p: ProjectileState, currentTick: number, dt: number): boolean {
  if (currentTick >= p.expiresAtTick) return false;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT) return false;
  return true;
}

/**
 * Returns the first tank in `tanks` (other than `p.ownerId`) whose hitbox the
 * projectile is currently inside. Returns null if no hit.
 *
 * Hit radius = projectile radius + TANK_RADIUS. Spawn-protected and dead
 * tanks are ignored.
 */
export function findHit(p: ProjectileState, tanks: readonly TankState[]): TankState | null {
  const r = (p.kind === ProjectileKind.BULLET ? BULLET_RADIUS : MISSILE_RADIUS) + TANK_RADIUS;
  const r2 = r * r;
  for (const t of tanks) {
    if (t.id === p.ownerId) continue;
    if (t.isDead) continue;
    if (t.isSpawnProtected) continue;
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    if (dx * dx + dy * dy <= r2) return t;
  }
  return null;
}
