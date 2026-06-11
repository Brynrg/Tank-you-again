import {
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_FUEL,
  SERVER_TICK_RATE,
  type SurvivalHudState,
  type TankState,
} from "@shared/types";

import type { Arena } from "./arena.js";
import type { AIChallengeLevel } from "./ai-enemy.js";
import { creditFuel } from "./economy.js";

/** Ticks between wave clear and the next wave spawning. */
export const INTERMISSION_TICKS = 8 * SERVER_TICK_RATE;
/** Shorter breather before the very first wave. */
export const FIRST_WAVE_DELAY_TICKS = 4 * SERVER_TICK_RATE;
/** How long a destroyed wave tank lingers as a corpse before removal. */
export const CORPSE_LINGER_TICKS = 2 * SERVER_TICK_RATE;
/** Alive-enemy ceiling regardless of wave number (perf + readability). */
export const MAX_WAVE_SIZE = 8;
/** Wave enemies spawn at least this far from the player. */
const MIN_SPAWN_DISTANCE = 700;
/** Inset from the arena border for edge spawns. */
const EDGE_INSET = 80;

const TIERS: AIChallengeLevel[] = ["easy", "medium", "hard", "expert"];

/**
 * Difficulty mix for wave `n` as fractions of [easy, medium, hard, expert].
 * Deterministic brackets so pacing is tunable and testable at a glance.
 */
function mixFor(n: number): [number, number, number, number] {
  if (n <= 2) return [1, 0, 0, 0];
  if (n <= 4) return [0.6, 0.4, 0, 0];
  if (n <= 6) return [0.3, 0.6, 0.1, 0];
  if (n <= 8) return [0.1, 0.6, 0.3, 0];
  if (n <= 10) return [0, 0.4, 0.5, 0.1];
  if (n <= 13) return [0, 0.2, 0.5, 0.3];
  return [0, 0, 0.4, 0.6];
}

/** How many tanks wave `n` fields (grows to {@link MAX_WAVE_SIZE}). */
export function waveSize(n: number): number {
  return Math.min(2 + Math.floor(n * 0.7), MAX_WAVE_SIZE);
}

/**
 * The exact tier lineup for wave `n` — deterministic largest-remainder
 * allocation of {@link mixFor} over {@link waveSize}, ordered easy→expert.
 */
export function waveComposition(n: number): AIChallengeLevel[] {
  const count = waveSize(n);
  const mix = mixFor(n);
  const exact = mix.map((f) => f * count);
  const base = exact.map(Math.floor);
  let remaining = count - base.reduce((a, b) => a + b, 0);
  // Hand leftovers to the largest fractional remainders (ties → harder tier,
  // so rounding never makes a wave easier than its bracket intends).
  const order = exact
    .map((v, i) => ({ frac: v - Math.floor(v), i }))
    .sort((a, b) => b.frac - a.frac || b.i - a.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    base[i] = (base[i] ?? 0) + 1;
    remaining -= 1;
  }
  const lineup: AIChallengeLevel[] = [];
  base.forEach((c, i) => {
    for (let k = 0; k < c; k++) lineup.push(TIERS[i]!);
  });
  return lineup;
}

export interface SurvivalOptions {
  /** Inject randomness for tests (defaults to Math.random). */
  random?: () => number;
}

/**
 * Wave director for single-player survival. Owns no simulation rules — it
 * composes the {@link Arena} (spawning wave enemies, removing wrecks, paying
 * wave bonuses) and exposes HUD state for the snapshot. The embedder calls
 * {@link tick} once per arena step.
 */
export class SurvivalDirector {
  private wave = 0;
  private phase: SurvivalHudState["phase"] = "intermission";
  private nextWaveAtTick: number;
  /** Live wave-enemy ids → tick they died (null while alive). */
  private readonly waveEnemies = new Map<string, number | null>();
  private readonly random: () => number;

  constructor(
    private readonly arena: Arena,
    private readonly playerId: string,
    opts: SurvivalOptions = {},
  ) {
    this.random = opts.random ?? Math.random;
    this.nextWaveAtTick = arena.tickIndex + FIRST_WAVE_DELAY_TICKS;
  }

  /** Advance the wave state machine. Call after each arena.step(). */
  tick(): void {
    if (this.phase === "over") return;
    const t = this.arena.tickIndex;

    const player = this.arena.getTank(this.playerId);
    if (!player || player.isDead) {
      this.phase = "over";
      return;
    }

    // Wreck bookkeeping runs in every phase — end-of-wave corpses must still
    // clear during the intermission, not wait for the next active phase.
    const alive = this.pruneWrecks(t);

    if (this.phase === "intermission") {
      if (t >= this.nextWaveAtTick) this.spawnWave(t);
      return;
    }

    if (alive === 0) {
      this.payWaveBonus(player);
      this.phase = "intermission";
      this.nextWaveAtTick = t + INTERMISSION_TICKS;
    }
  }

  /** Mark fresh deaths, remove lingered wrecks; returns live enemy count. */
  private pruneWrecks(t: number): number {
    let alive = 0;
    for (const [id, diedAt] of this.waveEnemies) {
      const tank = this.arena.getTank(id);
      if (!tank) {
        this.waveEnemies.delete(id);
        continue;
      }
      if (!tank.isDead) {
        alive += 1;
        continue;
      }
      if (diedAt === null) {
        this.waveEnemies.set(id, t);
      } else if (t - diedAt >= CORPSE_LINGER_TICKS) {
        this.arena.removeTank(id);
        this.waveEnemies.delete(id);
      }
    }
    return alive;
  }

  private spawnWave(t: number): void {
    this.wave += 1;
    this.phase = "active";
    const player = this.arena.getTank(this.playerId);
    for (const tier of waveComposition(this.wave)) {
      const spawn = this.pickEdgeSpawn(player ?? null);
      const id = this.arena.spawnAIEnemy(tier, spawn);
      this.waveEnemies.set(id, null);
    }
  }

  /** Random edge point, re-rolled (bounded) until far enough from the player. */
  private pickEdgeSpawn(player: TankState | null): { x: number; y: number } {
    for (let attempt = 0; attempt < 12; attempt++) {
      const edge = Math.floor(this.random() * 4);
      const along = this.random();
      const x =
        edge === 0 ? EDGE_INSET
        : edge === 1 ? MAP_WIDTH - EDGE_INSET
        : EDGE_INSET + along * (MAP_WIDTH - 2 * EDGE_INSET);
      const y =
        edge === 2 ? EDGE_INSET
        : edge === 3 ? MAP_HEIGHT - EDGE_INSET
        : EDGE_INSET + along * (MAP_HEIGHT - 2 * EDGE_INSET);
      if (!player || Math.hypot(x - player.x, y - player.y) >= MIN_SPAWN_DISTANCE) {
        return { x, y };
      }
    }
    // Degenerate map/player layout: far corner beats an infinite loop.
    return { x: EDGE_INSET, y: EDGE_INSET };
  }

  /** Supply drop on wave clear: fuel (= life), armor patch, ammo trickle. */
  private payWaveBonus(player: TankState): void {
    creditFuel(player, MAX_FUEL * 0.45);
    player.armor.front = Math.min(100, player.armor.front + 25);
    player.armor.side = Math.min(100, player.armor.side + 25);
    player.armor.rear = Math.min(100, player.armor.rear + 25);
    player.ammo.missiles += 2;
    player.ammo.mines += 1;
    if (this.wave % 3 === 0) {
      player.ammo.shields += 1;
      player.ammo.radar += 1;
    }
    if (this.wave % 4 === 0) player.ammo.teleports += 1;
  }

  /** HUD-facing state, attached to single-player snapshots. */
  hudState(): SurvivalHudState {
    let enemiesLeft = 0;
    for (const [id] of this.waveEnemies) {
      const tank = this.arena.getTank(id);
      if (tank && !tank.isDead) enemiesLeft += 1;
    }
    return {
      wave: this.wave,
      phase: this.phase,
      enemiesLeft,
      nextWaveInTicks:
        this.phase === "intermission"
          ? Math.max(0, this.nextWaveAtTick - this.arena.tickIndex)
          : 0,
      waveReached: this.wave,
    };
  }
}
