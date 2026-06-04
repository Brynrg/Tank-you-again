import {
  COMMAND_ARRIVAL_RADIUS,
  FUEL_MOVE_PER_SEC,
  MAP_HEIGHT,
  MAP_WIDTH,
  TANK_RADIUS,
  TANK_SPEED,
  type TankState,
} from "@shared/types";

import type { PlayerInputState } from "./loop-types.js";
import { debitFuel } from "./economy.js";

/**
 * Snaps the hull to the 8-cardinal heading implied by `up/down/left/right`.
 * Moves at TANK_SPEED units/sec along that heading. Diagonals are normalized
 * (no √2 cheese). Drains `FUEL_MOVE_PER_SEC * dt` fuel each tick the tank is
 * actually moving. Updates `tank.angle` to the new hull direction; leaves
 * `tank.turretAngle` alone (driven by `input.aim`).
 *
 * No-op if the tank is dead.
 */
export function stepMovement(tank: TankState, input: PlayerInputState, dt: number): void {
  if (tank.isDead) return;

  let dx = 0;
  let dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;

  if (dx !== 0 || dy !== 0) {
    // Snap hull angle to the 8-way heading.
    tank.angle = Math.atan2(dy, dx);

    // Normalize so diagonals don't go faster than cardinals.
    const len = Math.hypot(dx, dy);
    const nx = dx / len;
    const ny = dy / len;

    const stepX = nx * TANK_SPEED * dt;
    const stepY = ny * TANK_SPEED * dt;

    tank.x = clamp(tank.x + stepX, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS);
    tank.y = clamp(tank.y + stepY, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS);

    // Fuel drain proportional to dt — but only if the tank actually moved.
    debitFuel(tank, FUEL_MOVE_PER_SEC * dt, "MOVE");
  }

  // Turret tracks the latest aim regardless of movement.
  tank.turretAngle = input.aim;
}

/**
 * Move toward an authoritative destination command. This keeps the classic
 * click-to-move feel while still broadcasting smooth 20 Hz snapshots.
 *
 * Returns true when the command has arrived and should be cleared.
 */
export function stepMoveCommand(
  tank: TankState,
  target: { x: number; y: number },
  aim: number,
  dt: number,
): boolean {
  if (tank.isDead) return true;

  const tx = clamp(target.x, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS);
  const ty = clamp(target.y, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS);
  const dx = tx - tank.x;
  const dy = ty - tank.y;
  const dist = Math.hypot(dx, dy);

  tank.turretAngle = aim;

  if (dist <= COMMAND_ARRIVAL_RADIUS) return true;
  if (!debitFuel(tank, FUEL_MOVE_PER_SEC * dt, "MOVE")) return true;

  const maxStep = TANK_SPEED * dt;
  const step = Math.min(maxStep, dist);
  const nx = dx / dist;
  const ny = dy / dist;

  tank.angle = snapToEightWay(Math.atan2(ny, nx));
  tank.x = clamp(tank.x + nx * step, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS);
  tank.y = clamp(tank.y + ny * step, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS);

  return dist - step <= COMMAND_ARRIVAL_RADIUS;
}

function snapToEightWay(angle: number): number {
  const step = Math.PI / 4;
  return Math.round(angle / step) * step;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
