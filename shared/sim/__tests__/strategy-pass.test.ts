import { beforeEach, describe, expect, it } from "vitest";

import {
  ItemType,
  KILL_BOUNTY_FUEL_PER_TIER,
  MINE_ARMING_TICKS,
  MINE_RADIUS,
  MISSILE_SPEED,
  MilitaryRank,
  SHIELD_AUTO_LOWER_TICKS,
  TeamColor,
  type TankState,
} from "@shared/types";

import { Arena } from "../arena.js";
import { applyDamage } from "../damage.js";

describe("strategy pass (mines / shield / kill credit / bounty)", () => {
  let arena: Arena;
  let a: TankState;
  let b: TankState;

  beforeEach(() => {
    arena = new Arena({ aiTargetCount: 0, trackXp: true });
    a = arena.addPlayer({ id: "A", name: "A", team: TeamColor.RED, spawn: { x: 500, y: 500 } });
    b = arena.addPlayer({ id: "B", name: "B", team: TeamColor.BLUE, spawn: { x: 900, y: 500 } });
    a.rank = MilitaryRank.RECRUIT;
    b.rank = MilitaryRank.RECRUIT;
    a.isSpawnProtected = false;
    b.isSpawnProtected = false;
  });

  it("missiles are fast enough to contest bullets at mid-range", () => {
    expect(MISSILE_SPEED).toBeGreaterThanOrEqual(480);
  });

  it("mines drop outside their own blast radius", () => {
    arena.placeMine("A");
    const mine = arena.snapshotFor("A", false).visibleMines[0]!;
    expect(mine).toBeDefined();
    const d = Math.hypot(mine.x - a.x, mine.y - a.y);
    expect(d).toBeGreaterThan(MINE_RADIUS);
  });

  it("mines are inert during the arming delay, live after it", () => {
    arena.placeMine("A");
    const mine = arena.snapshotFor("A", false).visibleMines[0]!;
    // Park the enemy directly on the mine.
    b.x = mine.x;
    b.y = mine.y;
    const fuelBefore = b.fuel;
    for (let i = 0; i < MINE_ARMING_TICKS - 2; i++) arena.step();
    expect(b.fuel).toBe(fuelBefore); // untouched while arming
    for (let i = 0; i < 6; i++) arena.step();
    expect(b.fuel).toBeLessThan(fuelBefore); // detonated once armed
  });

  it("shield auto-lowers after the grace period when not taking damage", () => {
    arena.useItem("B", ItemType.SHIELD);
    expect(b.hasShield).toBe(true);
    const fuelAtRaise = b.fuel;
    for (let i = 0; i < SHIELD_AUTO_LOWER_TICKS + 3; i++) arena.step();
    expect(b.hasShield).toBe(false);
    // Drain stopped at auto-lower: far less than a continuous-drain burn.
    expect(fuelAtRaise - b.fuel).toBeLessThan(95);
  });

  it("shield stays up past the grace period while under fire", () => {
    arena.useItem("B", ItemType.SHIELD);
    b.fuel = 900;
    for (let i = 0; i < SHIELD_AUTO_LOWER_TICKS + 2; i++) {
      applyDamage(b, 1, "A");
      arena.step();
      if (i < SHIELD_AUTO_LOWER_TICKS) expect(b.hasShield).toBe(true);
    }
  });

  it("fuel-drain deaths credit the last damager and pay the tier bounty", () => {
    a.fuel = 500; // headroom below MAX_FUEL so the bounty credit is visible
    b.powerTier = 2;
    applyDamage(b, 50, "A"); // A tags B...
    b.fuel = -1; // ...B runs dry with no direct killer
    arena.step();
    expect(b.isDead).toBe(true);
    expect(a.kills ?? 0).toBe(1); // credited, not leaked
    expect(a.fuel).toBeGreaterThanOrEqual(500 + 2 * KILL_BOUNTY_FUEL_PER_TIER - 5);
    expect(b.lastKillerX).toBeDefined(); // respawn bias marker recorded
  });

  it("respawn clears the killer marker and damage tags", () => {
    applyDamage(b, 50, "A");
    b.fuel = -1;
    arena.step();
    for (let i = 0; i < 70; i++) arena.step(); // ride out respawn delay
    expect(b.isDead).toBe(false);
    expect(b.lastKillerX).toBeUndefined();
    expect(b.lastDamagerId).toBeUndefined();
  });
});
