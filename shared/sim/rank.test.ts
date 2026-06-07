import { describe, it, expect } from "vitest";
import { applyXpDelta, RankableTank } from "./rank";
import { MilitaryRank, RANK_XP_THRESHOLDS } from "@shared/types";

describe("applyXpDelta", () => {
  it("adds XP and ranks up", () => {
    const tank: RankableTank = {
      rank: MilitaryRank.RECRUIT,
      xp: 0,
      highestRank: MilitaryRank.RECRUIT,
    };

    // Need 100 XP for PRIVATE
    const changed = applyXpDelta(tank, 150);

    expect(changed).toBe(true);
    expect(tank.xp).toBe(150);
    expect(tank.rank).toBe(MilitaryRank.PRIVATE);
    expect(tank.highestRank).toBe(MilitaryRank.PRIVATE);
  });

  it("does not allow demotion below highest rank threshold", () => {
    const tank: RankableTank = {
      rank: MilitaryRank.CORPORAL,
      xp: 350,
      highestRank: MilitaryRank.CORPORAL,
    };

    // Need 300 XP for CORPORAL, try to drop below it
    const changed = applyXpDelta(tank, -100);

    expect(changed).toBe(false);
    expect(tank.xp).toBe(RANK_XP_THRESHOLDS[MilitaryRank.CORPORAL]); // Floor is 300
    expect(tank.rank).toBe(MilitaryRank.CORPORAL);
    expect(tank.highestRank).toBe(MilitaryRank.CORPORAL);
  });

  it("allows negative XP within rank bounds", () => {
    const tank: RankableTank = {
      rank: MilitaryRank.CORPORAL,
      xp: 450,
      highestRank: MilitaryRank.CORPORAL,
    };

    // Need 300 XP for CORPORAL, 450 - 50 = 400
    const changed = applyXpDelta(tank, -50);

    expect(changed).toBe(false);
    expect(tank.xp).toBe(400);
    expect(tank.rank).toBe(MilitaryRank.CORPORAL);
    expect(tank.highestRank).toBe(MilitaryRank.CORPORAL);
  });

  it("ranks up when hitting the exact threshold", () => {
    const tank: RankableTank = {
      rank: MilitaryRank.RECRUIT,
      xp: 50,
      highestRank: MilitaryRank.RECRUIT,
    };

    // Need 100 XP for PRIVATE
    const changed = applyXpDelta(tank, 50);

    expect(changed).toBe(true);
    expect(tank.xp).toBe(100);
    expect(tank.rank).toBe(MilitaryRank.PRIVATE);
    expect(tank.highestRank).toBe(MilitaryRank.PRIVATE);
  });

  it("handles an invalid highestRank gracefully", () => {
    const tank: RankableTank = {
      rank: MilitaryRank.RECRUIT,
      xp: 0,
      highestRank: "INVALID_RANK_123",
    };

    // Should default to RECRUIT floor which is 0
    const changed = applyXpDelta(tank, -50);

    expect(changed).toBe(false);
    expect(tank.xp).toBe(0);
    expect(tank.rank).toBe(MilitaryRank.RECRUIT);
    expect(tank.highestRank).toBe("INVALID_RANK_123");
  });

  it("returns false and doesn't change rank if delta is 0", () => {
    const tank: RankableTank = {
      rank: MilitaryRank.PRIVATE,
      xp: 150,
      highestRank: MilitaryRank.PRIVATE,
    };

    const changed = applyXpDelta(tank, 0);

    expect(changed).toBe(false);
    expect(tank.xp).toBe(150);
    expect(tank.rank).toBe(MilitaryRank.PRIVATE);
    expect(tank.highestRank).toBe(MilitaryRank.PRIVATE);
  });
});
