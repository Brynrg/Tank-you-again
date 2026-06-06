import { describe, it, expect } from "vitest";
import { calculateArmorPenetration } from "../damage.js";
import { ProjectileState, TankState, TeamColor, MilitaryRank, ProjectileKind } from "@shared/types";

function createMockTank(x: number, y: number, angle: number): TankState {
  return {
    id: "tank1",
    name: "Test Tank",
    team: TeamColor.BLUE,
    rank: MilitaryRank.RECRUIT,
    x,
    y,
    angle,
    turretAngle: angle,
    fuel: 100,
    hasShield: false,
    ammo: {
      radar: 0,
      missiles: 0,
      mines: 0,
      shields: 0,
      teleports: 0,
    },
    isSpawnProtected: false,
    spawnProtectedUntilTick: 0,
    isDead: false,
    respawnAtTick: 0,
    armor: {
      front: 100,
      side: 50,
      rear: 20,
    },
  };
}

function createMockProjectile(x: number, y: number, damage: number): ProjectileState {
  return {
    id: "proj1",
    ownerId: "enemy1",
    kind: ProjectileKind.BULLET,
    x,
    y,
    vx: 0,
    vy: 0,
    damage,
    spawnTick: 0,
    expiresAtTick: 100,
  };
}

describe("calculateArmorPenetration", () => {
  it("calculates front armor hit correctly", () => {
    // Tank is at 0,0 facing right (0 radians)
    const tank = createMockTank(0, 0, 0);
    // Projectile is to the right of the tank (hitting the front)
    const projectile = createMockProjectile(10, 0, 100);

    const result = calculateArmorPenetration(projectile, tank);
    expect(result.hitSide).toBe("front");
    // Front armor multiplier is 1.0, armor is 100. Effective damage = 100. Armor pen = min(100, 100) = 100
    expect(result.damage).toBe(100);
    expect(result.armorPenetration).toBe(100);
  });

  it("calculates side armor hit correctly (bottom)", () => {
    // Tank is at 0,0 facing right
    const tank = createMockTank(0, 0, 0);
    // Projectile is below the tank (hitting the side)
    const projectile = createMockProjectile(0, 10, 100);

    const result = calculateArmorPenetration(projectile, tank);
    expect(result.hitSide).toBe("side");
    // Side armor multiplier is 0.8, armor is 50. Effective damage = 80. Armor pen = min(80, 50) = 50
    expect(result.damage).toBe(80);
    expect(result.armorPenetration).toBe(50);
  });

  it("calculates side armor hit correctly (top)", () => {
    // Tank is at 0,0 facing right
    const tank = createMockTank(0, 0, 0);
    // Projectile is above the tank (hitting the side)
    const projectile = createMockProjectile(0, -10, 100);

    const result = calculateArmorPenetration(projectile, tank);
    expect(result.hitSide).toBe("side");
  });

  it("calculates rear armor hit correctly", () => {
    // Tank is at 0,0 facing right
    const tank = createMockTank(0, 0, 0);
    // Projectile is to the left of the tank (hitting the rear)
    const projectile = createMockProjectile(-10, 0, 100);

    const result = calculateArmorPenetration(projectile, tank);
    expect(result.hitSide).toBe("rear");
    // Rear armor multiplier is 0.6, armor is 20. Effective damage = 60. Armor pen = min(60, 20) = 20
    expect(result.damage).toBe(60);
    expect(result.armorPenetration).toBe(20);
  });

  it("handles angles relative to tank rotation", () => {
    // Tank is at 0,0 facing UP (-PI/2)
    const tank = createMockTank(0, 0, -Math.PI / 2);
    // Projectile is above the tank (hitting the front)
    const projectile = createMockProjectile(0, -10, 100);

    const result = calculateArmorPenetration(projectile, tank);
    expect(result.hitSide).toBe("front");
  });

  it("handles effective damage lower than armor value", () => {
    const tank = createMockTank(0, 0, 0);
    // Front hit, but only 10 damage. Armor is 100.
    const projectile = createMockProjectile(10, 0, 10);

    const result = calculateArmorPenetration(projectile, tank);
    expect(result.hitSide).toBe("front");
    expect(result.damage).toBe(10);
    expect(result.armorPenetration).toBe(10);
  });
});