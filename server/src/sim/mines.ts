import { randomUUID } from "node:crypto";

import {
  FUEL_MINE,
  MINE_DAMAGE,
  MINE_RADIUS,
  type MineState,
  type TankState,
} from "@shared/types";

import { applyDamage } from "./damage.js";
import { debitFuel } from "./economy.js";

export interface PlaceMineResult {
  ok: boolean;
  mine?: MineState;
  reason?: string;
}

/** Place a mine at the tank's current position. Costs FUEL_MINE. */
export function placeMine(tank: TankState, currentTick: number): PlaceMineResult {
  if (tank.isDead) return { ok: false, reason: "dead" };
  if (tank.ammo.mines <= 0) return { ok: false, reason: "ammo" };
  if (!debitFuel(tank, FUEL_MINE, "MINE")) return { ok: false, reason: "fuel" };
  tank.ammo.mines -= 1;
  const mine: MineState = {
    id: randomUUID(),
    ownerId: tank.id,
    ownerTeam: tank.team,
    // Offset the mine slightly behind the tank along its hull direction so it
    // can't immediately self-trigger as the tank passes over.
    x: tank.x - Math.cos(tank.angle) * (MINE_RADIUS * 0.6),
    y: tank.y - Math.sin(tank.angle) * (MINE_RADIUS * 0.6),
    spawnTick: currentTick,
  };
  return { ok: true, mine };
}

export interface MineDetonation {
  mine: MineState;
  /** Tanks (with ids) that were inside the explosion radius. */
  victims: TankState[];
}

/**
 * Walk every mine and check for enemy contact. Returns the list of mines that
 * detonated this tick along with their victims. Caller is responsible for
 * removing those mines from the world and applying damage.
 *
 * Allies (same team as `mine.ownerTeam`) do NOT trigger the mine but DO take
 * splash damage when an enemy triggers it (per TODO.md).
 */
export function stepMineDetonations(
  mines: Iterable<MineState>,
  tanks: Iterable<TankState>,
): MineDetonation[] {
  const r2 = MINE_RADIUS * MINE_RADIUS;
  const dets: MineDetonation[] = [];

  const tanksArr = [...tanks];

  for (const mine of mines) {
    // Trigger when any enemy is inside the radius.
    let triggered = false;
    for (const t of tanksArr) {
      if (t.isDead) continue;
      if (t.team === mine.ownerTeam) continue;
      if (t.isSpawnProtected) continue;
      const dx = t.x - mine.x;
      const dy = t.y - mine.y;
      if (dx * dx + dy * dy <= r2) {
        triggered = true;
        break;
      }
    }
    if (!triggered) continue;

    // Collect victims: every tank (enemy or ally) inside the radius.
    const victims: TankState[] = [];
    for (const t of tanksArr) {
      if (t.isDead) continue;
      if (t.isSpawnProtected) continue;
      const dx = t.x - mine.x;
      const dy = t.y - mine.y;
      if (dx * dx + dy * dy <= r2) victims.push(t);
    }
    dets.push({ mine, victims });
  }

  return dets;
}

/** Apply MINE_DAMAGE to every victim of the detonation. */
export function applyMineDamage(det: MineDetonation): TankState[] {
  const killed: TankState[] = [];
  for (const v of det.victims) {
    if (applyDamage(v, MINE_DAMAGE, det.mine.ownerId) === "killed") killed.push(v);
  }
  return killed;
}
