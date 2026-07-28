import { describe, it, expect } from "vitest";
import { MAX_FUEL, TeamColor } from "@shared/types";
import { Arena } from "../arena.js";
import {
  CORPSE_LINGER_TICKS,
  FIRST_WAVE_DELAY_TICKS,
  INTERMISSION_TICKS,
  MAX_WAVE_SIZE,
  SurvivalDirector,
  waveComposition,
  waveSize,
} from "../survival.js";

const TIER_SCORE = { easy: 0, medium: 1, hard: 2, expert: 3 } as const;

function totalThreat(n: number): number {
  return waveComposition(n).reduce((s, t) => s + 1 + TIER_SCORE[t], 0);
}

function makeSurvival(seed = 0.5) {
  const arena = new Arena({
    aiTargetCount: 0,
    autoRespawn: false,
    botTeams: [TeamColor.RED],
    trackXp: true,
  });
  const player = arena.addPlayer({ name: "You", team: TeamColor.BLUE });
  const director = new SurvivalDirector(arena, player.id, { random: () => seed });
  return { arena, player, director };
}

function stepUntil(arena: Arena, director: SurvivalDirector, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    arena.step();
    director.tick();
  }
}

/** Kill every live wave enemy in place (simulates the player clearing it). */
function slaughterWave(arena: Arena, playerId: string): void {
  const snap = arena.snapshotFor(playerId, false);
  for (const t of snap.tanks) {
    if (t.id === playerId || t.isDead) continue;
    t.fuel = 0; // fuel is life: driveTank kills at <= 0 on the next step
  }
}

describe("waveComposition", () => {
  it("grows wave size to the cap and never past it", () => {
    expect(waveSize(1)).toBe(2);
    let prev = 0;
    for (let n = 1; n <= 30; n++) {
      const size = waveSize(n);
      expect(size).toBeGreaterThanOrEqual(prev);
      expect(size).toBeLessThanOrEqual(MAX_WAVE_SIZE);
      expect(waveComposition(n)).toHaveLength(size);
      prev = size;
    }
  });

  it("ramps difficulty monotonically (total threat never drops)", () => {
    let prev = 0;
    for (let n = 1; n <= 30; n++) {
      const threat = totalThreat(n);
      expect(threat).toBeGreaterThanOrEqual(prev);
      prev = threat;
    }
  });

  it("starts pure easy and ends expert-heavy", () => {
    expect(new Set(waveComposition(1))).toEqual(new Set(["easy"]));
    const late = waveComposition(20);
    expect(late.filter((t) => t === "expert").length).toBeGreaterThan(late.length / 2);
  });
});

describe("SurvivalDirector", () => {
  it("spawns wave 1 after the opening delay", () => {
    const { arena, player, director } = makeSurvival();
    expect(director.hudState().wave).toBe(0);
    expect(director.hudState().phase).toBe("intermission");

    stepUntil(arena, director, FIRST_WAVE_DELAY_TICKS + 1);
    const hud = director.hudState();
    expect(hud.wave).toBe(1);
    expect(hud.phase).toBe("active");
    expect(hud.enemiesLeft).toBe(waveSize(1));
    // Wave enemies exist in the world beside the player.
    expect(arena.snapshotFor(player.id, false).tanks.length).toBe(1 + waveSize(1));
  });

  it("clears the wave, pays the bonus, and schedules the next one", () => {
    const { arena, player, director } = makeSurvival();
    stepUntil(arena, director, FIRST_WAVE_DELAY_TICKS + 1);

    player.fuel = MAX_FUEL * 0.2;
    player.armor.front = 40;
    const missilesBefore = player.ammo.missiles;

    slaughterWave(arena, player.id);
    stepUntil(arena, director, 2); // one step to kill on fuel-out, one to clear

    const hud = director.hudState();
    expect(hud.phase).toBe("intermission");
    expect(hud.wave).toBe(1);
    expect(hud.nextWaveInTicks).toBeGreaterThan(0);
    // Supply drop landed.
    expect(player.fuel).toBeGreaterThan(MAX_FUEL * 0.2);
    expect(player.armor.front).toBe(65);
    expect(player.ammo.missiles).toBe(missilesBefore + 2);

    // Next wave arrives after the intermission.
    stepUntil(arena, director, INTERMISSION_TICKS + 1);
    expect(director.hudState().wave).toBe(2);
    expect(director.hudState().phase).toBe("active");
    expect(director.hudState().enemiesLeft).toBe(waveSize(2));
  });

  it("removes wrecks after the corpse linger", () => {
    const { arena, player, director } = makeSurvival();
    stepUntil(arena, director, FIRST_WAVE_DELAY_TICKS + 1);
    slaughterWave(arena, player.id);
    stepUntil(arena, director, 1 + CORPSE_LINGER_TICKS + 1);
    // Only the player remains in the world.
    expect(arena.snapshotFor(player.id, false).tanks.length).toBe(1);
  });

  it("never auto-respawns wave enemies (autoRespawn off)", () => {
    const { arena, player, director } = makeSurvival();
    stepUntil(arena, director, FIRST_WAVE_DELAY_TICKS + 1);
    slaughterWave(arena, player.id);
    // Step past the normal respawn delay; they must stay dead/removed.
    stepUntil(arena, director, 4 * 20);
    const others = arena
      .snapshotFor(player.id, false)
      .tanks.filter((t) => t.id !== player.id && !t.isDead);
    expect(others).toHaveLength(0);
  });

  it("ends the run when the player dies, preserving waveReached", () => {
    const { arena, player, director } = makeSurvival();
    stepUntil(arena, director, FIRST_WAVE_DELAY_TICKS + 1);

    player.fuel = 0; // next step kills the player
    stepUntil(arena, director, 2);

    const hud = director.hudState();
    expect(hud.phase).toBe("over");
    expect(hud.waveReached).toBe(1);

    // Director is inert after game over: no new waves, ever.
    stepUntil(arena, director, INTERMISSION_TICKS * 2);
    expect(director.hudState().wave).toBe(1);
    expect(director.hudState().phase).toBe("over");
  });

  it("counts down to the next wave in the HUD state", () => {
    const { arena, director } = makeSurvival();
    arena.step();
    director.tick();
    const first = director.hudState().nextWaveInTicks;
    arena.step();
    director.tick();
    expect(director.hudState().nextWaveInTicks).toBe(first - 1);
  });
});
