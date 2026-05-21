import { MAX_FUEL, type TankState } from "@shared/types";

export type FuelDebitReason =
  | "MOVE"
  | "FIRE_BULLET"
  | "FIRE_MISSILE"
  | "MINE"
  | "SHIELD"
  | "TELEPORT"
  | "DAMAGE";

/**
 * Debit fuel from `tank` for the given `reason`. Returns true on success.
 * Returns false (and does NOT debit) when the tank doesn't have enough fuel
 * to cover the cost — caller should refuse the action.
 *
 * `DAMAGE` is a special case: damage always lands (fuel can drop to 0 or
 * below), and the damage step is what triggers death — so DAMAGE always
 * returns true. Other reasons block on insufficient fuel.
 */
export function debitFuel(tank: TankState, amount: number, reason: FuelDebitReason): boolean {
  if (tank.isDead) return false;
  if (amount <= 0) return true;

  if (reason === "DAMAGE") {
    tank.fuel -= amount;
    if (tank.fuel < 0) tank.fuel = 0;
    return true;
  }

  if (tank.fuel < amount) return false;
  tank.fuel -= amount;
  if (tank.fuel < 0) tank.fuel = 0;
  return true;
}

/** Restore fuel from a pickup (clamped to MAX_FUEL). */
export function creditFuel(tank: TankState, amount: number): void {
  if (tank.isDead) return;
  tank.fuel = Math.min(MAX_FUEL, tank.fuel + amount);
}
