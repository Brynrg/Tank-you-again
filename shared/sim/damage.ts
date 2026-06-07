import { TankState, ProjectileState, TeamColor, TANK_RADIUS } from "@shared/types";

import { debitFuel } from "./economy.js";

export function calculateArmorPenetration(
  projectile: ProjectileState,
  tank: TankState,
): { damage: number; armorPenetration: number; hitSide: "front" | "side" | "rear" } {
  // Calculate angle relative to tank's forward direction
  const dx = projectile.x - tank.x;
  const dy = projectile.y - tank.y;
  const angleToTank = Math.atan2(dy, dx);
  const relativeAngle = (angleToTank - tank.angle + Math.PI * 2) % (Math.PI * 2);

  // Determine which armor face was hit (front, side, rear)
  let hitSide: "front" | "side" | "rear" = "front";

  if (
    (relativeAngle > Math.PI * 0.25 && relativeAngle < Math.PI * 0.75) ||
    (relativeAngle > Math.PI * 1.25 && relativeAngle < Math.PI * 1.75)
  ) {
    hitSide = "side";
  } else if (relativeAngle >= Math.PI * 0.75 && relativeAngle <= Math.PI * 1.25) {
    hitSide = "rear";
  }

  // Calculate damage multiplier based on armor facing
  let armorValue: number;
  let damageMultiplier: number;

  switch (hitSide) {
    case "front":
      armorValue = tank.armor.front;
      damageMultiplier = 1.0;
      break;
    case "side":
      armorValue = tank.armor.side;
      damageMultiplier = 0.8;
      break;
    case "rear":
      armorValue = tank.armor.rear;
      damageMultiplier = 0.6;
      break;
  }

  const effectiveDamage = projectile.damage * damageMultiplier;
  const armorPenetration = Math.min(effectiveDamage, armorValue);

  return { damage: effectiveDamage, armorPenetration, hitSide };
}

/**
 * Apply `amount` damage to `target`. Damage is debited from the tank's fuel
 * pool (fuel-as-health). Returns "killed" when fuel drops to 0; "alive"
 * otherwise.
 *
 * Spawn-protected / already-dead tanks ignore damage (returns "alive" without
 * mutating). Shield halves damage (rounded up); the shield's per-second drain
 * is handled by the per-tick economy, not here.
 *
 * NOTE: `calculateArmorPenetration` above is groundwork for a directional-armor
 * damage model that is NOT yet wired into the room loop. The loop and mines use
 * this fuel-based model; integrate armor here when that feature is finished.
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
