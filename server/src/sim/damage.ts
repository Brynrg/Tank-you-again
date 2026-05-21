import type { TankState } from "@shared/types";

import { debitFuel } from "./economy.js";

/**
 * Apply `amount` damage to `target`. Damage is debited from the tank's fuel
 * pool (fuel-as-health). Returns "killed" when fuel drops to 0; "alive"
 * otherwise.
 *
 * Spawn-protected tanks ignore damage entirely (returns "alive" without
 * mutating).
 *
 * Shield: if `target.hasShield` is true, damage is halved (rounded up). The
 * shield is NOT consumed here — the caller (per-tick economy.ts in
 * RoomLoop.tick) is responsible for the shield's per-second fuel drain.
 */
export function applyDamage(
  target: TankState,
  amount: number,
  _killerId: string | null,
): "alive" | "killed" {
  if (target.isDead) return "alive";
  if (target.isSpawnProtected) return "alive";
  if (amount <= 0) return "alive";

  let dmg = amount;
  if (target.hasShield) {
    dmg = Math.ceil(dmg / 2);
  }

  debitFuel(target, dmg, "DAMAGE");

  if (target.fuel <= 0) {
    target.fuel = 0;
    return "killed";
  }
  return "alive";
}
