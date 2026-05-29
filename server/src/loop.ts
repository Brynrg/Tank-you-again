import {
  FUEL_CRATE_RESTORE,
  FUEL_RADAR_SCAN,
  FUEL_SHIELD_PER_SEC,
  FUEL_TELEPORT,
  ItemType,
  MAP_HEIGHT,
  MAP_WIDTH,
  MINE_PICKUP_AMOUNT,
  MISSILE_PICKUP_AMOUNT,
  MilitaryRank,
  PICKUP_RADIUS,
  RADAR_PICKUP_AMOUNT,
  ProjectileKind,
  RESPAWN_DELAY_TICKS,
  ServerMessageType,
  SHIELD_PICKUP_AMOUNT,
  TANK_RADIUS,
  TELEPORT_MAX_RANGE,
  TELEPORT_PICKUP_AMOUNT,
  TICK_MS,
  XP_PER_DEATH,
  XP_PER_KILL,
  type ClientFireMessage,
  type ClientInputMessage,
  type ClientMoveToMessage,
  type ClientPlaceMineMessage,
  type ClientStopMessage,
  type ClientTeleportMessage,
  type ClientUseItemMessage,
  type GameEvent,
  type GameStateSnapshot,
  type MineState,
  type PickupState,
  type ProjectileState,
  type TankState,
  type TeamColor,
} from "@shared/types";

import type { Connection } from "./connection.js";
import { send } from "./connection.js";
import { EMPTY_INPUT, type PlayerCommandState, type PlayerInputState } from "./loop-types.js";
import type { AIChallengeLevel } from "./sim/ai-enemy.js";
import { AIEnemy } from "./sim/ai-enemy.js";
import { findHit, stepProjectile, tryFire } from "./sim/combat.js";
import { applyDamage } from "./sim/damage.js";
import { creditFuel, debitFuel } from "./sim/economy.js";
import { applyMineDamage, placeMine, stepMineDetonations } from "./sim/mines.js";
import { stepMoveCommand, stepMovement } from "./sim/movement.js";
import { computeVisionSet, scanRadar } from "./sim/vision.js";
import {
  makeTank,
  maybeSpawnPickup,
  pickTeam,
  respawnTank,
  tickSpawnProtection,
} from "./sim/world.js";

/**
 * Authoritative room. Single hot loop at SERVER_TICK_RATE Hz. All state
 * mutation happens inside `tick()`. Connections push intent via
 * `ingestInput`; `tick()` consumes the latest intent for each connection,
 * simulates one fixed step, then emits a masked snapshot per recipient.
 *
 * Invariants:
 *   - Inputs are never applied retroactively. Older `clientTick` is dropped.
 *   - Snapshots are per-client (mine masking; vision range).
 *   - `tick()` is synchronous; no awaits inside the loop. Persistence
 *     callbacks (rank XP) fire on death events and are best-effort.
 */
export class RoomLoop {
  private readonly tickIntervalMs = TICK_MS;
  private timer: NodeJS.Timeout | null = null;
  public tickIndex = 0;

  private readonly connections = new Map<string, Connection>();
  private readonly inputs = new Map<string, PlayerInputState>();
  private readonly commands = new Map<string, PlayerCommandState>();
  private readonly tanks = new Map<string, TankState>();
  private readonly projectiles = new Map<string, ProjectileState>();
  private readonly mines = new Map<string, MineState>();
  private readonly pickups = new Map<string, PickupState>();
  /** tankId -> entityId -> last active radar scan tick. */
  private readonly radarReveals = new Map<string, Map<string, number>>();
  /** Pending events for the current tick. Drained into snapshots and EVENT msgs. */
  private pendingEvents: GameEvent[] = [];

  private readonly pickupSpawnRef = { value: 0 };
  private readonly teamCensus = new Map<TeamColor, number>();

  /** AI enemies management */
  private readonly aiEnemies = new Map<string, AIEnemy>();
  private aiDifficulty: AIChallengeLevel = "medium";
  private readonly aiSpawnInterval = 120;
  private lastAISpawnTick = 0;
  private aiCount = 0;

  /** Hook: called with the room's tank state after a kill resolves. */
  public onXpDelta:
    | ((tankId: string, delta: number, reason: "kill" | "death" | "assist") => void)
    | null = null;

  start(): void {
    // Start with an initial AI enemy
    this.addAIEnemy();
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        // Last-resort safety net so one bad tick doesn't bring down the
        // server. Real recovery is a per-step try/catch where it matters.
        // eslint-disable-next-line no-console
        console.error("[roomloop] tick error", err);
      }
    }, this.tickIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Register an authenticated connection. Spawns a fresh tank for it. */
  addConnection(args: {
    conn: Connection;
    tankId: string;
    name: string;
    rank: MilitaryRank;
  }): TankState {
    const team = pickTeam(this.teamCensus);
    args.conn.team = team;
    args.conn.tankId = args.tankId;
    args.conn.name = args.name;
    args.conn.lastInputTick = 0;
    args.conn.lastBulletTick = -1_000_000;
    args.conn.lastMissileTick = -1_000_000;
    args.conn.lastMineTick = -1_000_000;
    args.conn.lastChatTick = -1_000_000;

    this.connections.set(args.conn.id, args.conn);
    this.inputs.set(args.conn.id, { ...EMPTY_INPUT });
    this.commands.delete(args.conn.id);
    this.radarReveals.delete(args.tankId);
    this.teamCensus.set(team, (this.teamCensus.get(team) ?? 0) + 1);

    const tank = makeTank({
      id: args.tankId,
      name: args.name,
      team,
      rank: args.rank,
      currentTick: this.tickIndex,
    });
    this.tanks.set(tank.id, tank);

    this.pendingEvents.push({
      tick: this.tickIndex,
      kind: "respawn",
      subjectId: tank.id,
    });

    return tank;
  }

  removeConnection(connId: string): void {
    const conn = this.connections.get(connId);
    if (!conn) return;
    this.connections.delete(connId);
    this.inputs.delete(connId);
    this.commands.delete(connId);
    if (conn.team) {
      this.teamCensus.set(conn.team, Math.max(0, (this.teamCensus.get(conn.team) ?? 1) - 1));
    }
    if (conn.tankId) {
      this.tanks.delete(conn.tankId);
      this.radarReveals.delete(conn.tankId);
      // Remove any projectiles/mines they own.
      for (const [id, p] of this.projectiles) {
        if (p.ownerId === conn.tankId) this.projectiles.delete(id);
      }
      for (const [id, m] of this.mines) {
        if (m.ownerId === conn.tankId) {
          this.mines.delete(id);
          this.forgetRadarEntity(id);
        }
      }
    }
  }

  /** Ingest a single INPUT for a connection. Latest wins; older clientTick dropped. */
  ingestInput(connId: string, msg: ClientInputMessage): void {
    const conn = this.connections.get(connId);
    if (!conn) return;
    if (msg.clientTick < conn.lastInputTick) return;
    conn.lastInputTick = msg.clientTick;
    this.inputs.set(connId, {
      up: !!msg.up,
      down: !!msg.down,
      left: !!msg.left,
      right: !!msg.right,
      aim: typeof msg.aim === "number" && Number.isFinite(msg.aim) ? msg.aim : 0,
      clientTick: msg.clientTick,
    });
  }

  ingestMoveTo(connId: string, msg: ClientMoveToMessage): void {
    const conn = this.connections.get(connId);
    if (!conn) return;
    if (msg.clientTick < conn.lastInputTick) return;
    conn.lastInputTick = msg.clientTick;
    this.commands.set(connId, {
      kind: "MOVE_TO",
      x: clamp(msg.x, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS),
      y: clamp(msg.y, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS),
      clientTick: msg.clientTick,
    });
  }

  ingestStop(connId: string, msg: ClientStopMessage): void {
    const conn = this.connections.get(connId);
    if (!conn) return;
    if (msg.clientTick < conn.lastInputTick) return;
    conn.lastInputTick = msg.clientTick;
    this.commands.set(connId, { kind: "STOP", clientTick: msg.clientTick });
  }

  handleFire(connId: string, msg: ClientFireMessage): void {
    const conn = this.connections.get(connId);
    if (!conn) return;
    const tank = this.tanks.get(conn.tankId);
    if (!tank) return;
    const lastTick =
      msg.weapon === ProjectileKind.MISSILE ? conn.lastMissileTick : conn.lastBulletTick;
    const r = tryFire(tank, msg.weapon, msg.aim, this.tickIndex, lastTick);
    if (!r.ok || !r.projectile) return;
    this.projectiles.set(r.projectile.id, r.projectile);
    if (msg.weapon === ProjectileKind.MISSILE) conn.lastMissileTick = this.tickIndex;
    else conn.lastBulletTick = this.tickIndex;
  }

  handlePlaceMine(connId: string, _msg: ClientPlaceMineMessage): void {
    const conn = this.connections.get(connId);
    if (!conn) return;
    const tank = this.tanks.get(conn.tankId);
    if (!tank) return;
    if (this.tickIndex - conn.lastMineTick < 20) return; // simple cooldown
    const r = placeMine(tank, this.tickIndex);
    if (!r.ok || !r.mine) return;
    this.mines.set(r.mine.id, r.mine);
    conn.lastMineTick = this.tickIndex;
  }

  handleUseItem(connId: string, msg: ClientUseItemMessage): void {
    const conn = this.connections.get(connId);
    if (!conn) return;
    const tank = this.tanks.get(conn.tankId);
    if (!tank || tank.isDead) return;
    if (msg.item === ItemType.SHIELD) {
      if (tank.hasShield) {
        tank.hasShield = false;
        return;
      }
      if (tank.ammo.shields <= 0) return;
      tank.ammo.shields -= 1;
      // Shield activation consumes one shield unit; per-tick fuel drain is
      // still applied in tick(), preserving fuel-as-health pressure.
      tank.hasShield = true;
    } else if (msg.item === ItemType.RADAR) {
      if (tank.ammo.radar <= 0) return;
      if (!debitFuel(tank, FUEL_RADAR_SCAN, "RADAR")) return;
      tank.ammo.radar -= 1;
      const reveals = this.getRadarReveals(tank.id);
      const result = scanRadar(
        tank,
        {
          mines: this.mines.values(),
          pickups: this.pickups.values(),
        },
        reveals,
        this.tickIndex,
      );
      this.pendingEvents.push({
        tick: this.tickIndex,
        kind: "radar_scan",
        subjectId: tank.id,
        payload: `${result.pickupsRevealed}:${result.minesRevealed}`,
      });
    }
  }

  handleTeleport(connId: string, msg: ClientTeleportMessage): void {
    const conn = this.connections.get(connId);
    if (!conn) return;
    const tank = this.tanks.get(conn.tankId);
    if (!tank || tank.isDead) return;
    if (tank.ammo.teleports <= 0) return;
    const dx = msg.x - tank.x;
    const dy = msg.y - tank.y;
    if (Math.hypot(dx, dy) > TELEPORT_MAX_RANGE) return;
    if (!debitFuel(tank, FUEL_TELEPORT, "TELEPORT")) return;
    tank.ammo.teleports -= 1;
    tank.x = clamp(msg.x, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS);
    tank.y = clamp(msg.y, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS);
  }

  /** One fixed simulation step. */
  private tick(): void {
    this.tickIndex += 1;
    const t = this.tickIndex;
    const dt = TICK_MS / 1000;

    // 1. Movement + per-tick costs (shield drain).
    for (const [connId, input] of this.inputs) {
      const conn = this.connections.get(connId);
      if (!conn) continue;
      const tank = this.tanks.get(conn.tankId);
      if (!tank) continue;

      if (tank.isDead) {
        if (t >= tank.respawnAtTick) respawnTank(tank, t);
        continue;
      }

      // Shield drain
      if (tank.hasShield) {
        if (!debitFuel(tank, FUEL_SHIELD_PER_SEC * dt, "SHIELD")) {
          tank.hasShield = false;
        }
      }

      const command = this.commands.get(connId);
      if (command?.kind === "MOVE_TO") {
        const arrived = stepMoveCommand(tank, command, input.aim, dt);
        if (arrived) this.commands.delete(connId);
      } else if (command?.kind === "STOP") {
        this.commands.delete(connId);
        tank.turretAngle = input.aim;
      } else {
        stepMovement(tank, input, dt);
      }

      // Ran out of fuel while alive (no killer)? Self-elim.
      if (tank.fuel <= 0) {
        this.killTank(tank, null);
        continue;
      }

      // Spawn protection auto-lifts.
      if (tickSpawnProtection(tank, t)) {
        this.pendingEvents.push({
          tick: t,
          kind: "spawn_protected_end",
          subjectId: tank.id,
        });
      }
    }

    // 2. Step projectiles.
    for (const [id, p] of this.projectiles) {
      if (!stepProjectile(p, t, dt)) {
        this.projectiles.delete(id);
        continue;
      }
      const hit = findHit(p, this.tanks.values());
      if (hit) {
        const result = applyDamage(hit, p.damage, p.ownerId);
        this.projectiles.delete(id);
        if (result === "killed") this.killTank(hit, p.ownerId);
      }
    }

    // 3. Mine detonations.
    const dets = stepMineDetonations(this.mines.values(), this.tanks.values());
    for (const det of dets) {
      this.mines.delete(det.mine.id);
      this.forgetRadarEntity(det.mine.id);
      this.pendingEvents.push({
        tick: t,
        kind: "mine_detonate",
        subjectId: det.mine.ownerId,
      });
      const killed = applyMineDamage(det);
      for (const v of killed) this.killTank(v, det.mine.ownerId);
    }

    // 4. Pickups: spawn + collection.
    maybeSpawnPickup(this.pickups, t, this.pickupSpawnRef);
    this.collectPickups();

    // 4.5. Update AI enemies.
    this.updateAIEnemies();

    // 5. Emit snapshots.
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const conn of this.connections.values()) {
      const tank = this.tanks.get(conn.tankId);
      if (!tank) continue;
      const snap = this.buildSnapshotFor(conn.id, tank, events);
      send(conn, { type: ServerMessageType.SNAPSHOT, snapshot: snap });
    }
  }

  private buildSnapshotFor(
    _connId: string,
    viewer: TankState,
    events: GameEvent[],
  ): GameStateSnapshot {
    const vis = computeVisionSet(
      viewer,
      {
        tanks: this.tanks.values(),
        projectiles: this.projectiles.values(),
        mines: this.mines.values(),
        pickups: this.pickups.values(),
        radarReveals: this.radarReveals.get(viewer.id) ?? new Map<string, number>(),
      },
      this.tickIndex,
    );

    const tanks: TankState[] = [];
    for (const t of this.tanks.values()) {
      if (vis.visibleTankIds.has(t.id)) tanks.push(t);
    }
    const projectiles: ProjectileState[] = [];
    for (const p of this.projectiles.values()) {
      if (vis.visibleProjectileIds.has(p.id)) projectiles.push(p);
    }
    const visibleMines: MineState[] = [];
    for (const m of this.mines.values()) {
      if (vis.visibleMineIds.has(m.id)) visibleMines.push(m);
    }
    const pickups: PickupState[] = [];
    for (const pk of this.pickups.values()) {
      if (vis.visiblePickupIds.has(pk.id)) pickups.push(pk);
    }

    return {
      tick: this.tickIndex,
      timestamp: Date.now(),
      tanks,
      projectiles,
      pickups,
      visibleMines,
      events,
    };
  }

  private collectPickups(): void {
    const r2 = (PICKUP_RADIUS + TANK_RADIUS) * (PICKUP_RADIUS + TANK_RADIUS);
    for (const [id, pk] of this.pickups) {
      for (const t of this.tanks.values()) {
        if (t.isDead) continue;
        const dx = pk.x - t.x;
        const dy = pk.y - t.y;
        if (dx * dx + dy * dy <= r2) {
          this.applyPickup(t, pk);
          this.pickups.delete(id);
          this.forgetRadarEntity(id);
          this.pendingEvents.push({
            tick: this.tickIndex,
            kind: "pickup",
            subjectId: t.id,
            payload: pk.type,
          });
          break;
        }
      }
    }
  }

  private applyPickup(t: TankState, pk: PickupState): void {
    switch (pk.type) {
      case ItemType.FUEL_CRATE:
        creditFuel(t, FUEL_CRATE_RESTORE);
        break;
      case ItemType.MISSILE:
        t.ammo.missiles += MISSILE_PICKUP_AMOUNT;
        break;
      case ItemType.MINE_PACK:
        t.ammo.mines += MINE_PICKUP_AMOUNT;
        break;
      case ItemType.TELEPORT_CHARGE:
        t.ammo.teleports += TELEPORT_PICKUP_AMOUNT;
        break;
      case ItemType.SHIELD:
        t.ammo.shields += SHIELD_PICKUP_AMOUNT;
        break;
      case ItemType.RADAR:
        t.ammo.radar += RADAR_PICKUP_AMOUNT;
        break;
    }
  }

  private killTank(victim: TankState, killerId: string | null): void {
    if (victim.isDead) return;
    victim.isDead = true;
    victim.respawnAtTick = this.tickIndex + RESPAWN_DELAY_TICKS;
    victim.hasShield = false;
    victim.fuel = 0;

    this.pendingEvents.push({
      tick: this.tickIndex,
      kind: "death",
      subjectId: victim.id,
      objectId: killerId ?? undefined,
    });

    if (killerId) {
      const killer = this.tanks.get(killerId);
      if (killer && killer.id !== victim.id) {
        this.pendingEvents.push({
          tick: this.tickIndex,
          kind: "kill",
          subjectId: killerId,
          objectId: victim.id,
        });
        // XP credit via callback (server/index.ts wires this to Prisma).
        this.onXpDelta?.(killerId, XP_PER_KILL, "kill");
      }
    }
    this.onXpDelta?.(victim.id, XP_PER_DEATH, "death");
  }

  // ── Internals exposed for tests ─────────────────────────────────────────
  getTanksForTesting(): Map<string, TankState> {
    return this.tanks;
  }
  getProjectilesForTesting(): Map<string, ProjectileState> {
    return this.projectiles;
  }
  getMinesForTesting(): Map<string, MineState> {
    return this.mines;
  }
  getPickupsForTesting(): Map<string, PickupState> {
    return this.pickups;
  }
  /** Drive a single tick without timer. Used by tests. */
  forceTick(): void {
    this.tick();
  }

  private getRadarReveals(tankId: string): Map<string, number> {
    let reveals = this.radarReveals.get(tankId);
    if (!reveals) {
      reveals = new Map<string, number>();
      this.radarReveals.set(tankId, reveals);
    }
    return reveals;
  }

  private forgetRadarEntity(entityId: string): void {
    for (const reveals of this.radarReveals.values()) {
      reveals.delete(entityId);
    }
  }

  // AI enemy management methods
  addAIEnemy(difficulty: AIChallengeLevel = this.aiDifficulty): AIEnemy {
    const aiId = `ai-${this.aiCount++}`;
    const team = pickTeam(this.teamCensus);
    const ai = new AIEnemy(aiId, team, difficulty);
    this.aiEnemies.set(aiId, ai);
    this.teamCensus.set(team, (this.teamCensus.get(team) ?? 0) + 1);

    // Add to tank map for simulation
    this.tanks.set(aiId, ai.getTank());

    return ai;
  }

  private updateAIEnemies(): void {
    const currentTick = this.tickIndex;

    // Spawn new AI enemies periodically
    if (currentTick - this.lastAISpawnTick >= this.aiSpawnInterval) {
      this.addAIEnemy();
      this.lastAISpawnTick = currentTick;
    }

    // Update all AI enemies
    for (const [aiId, ai] of this.aiEnemies) {
      const worldState = {
        tanks: Array.from(this.tanks.values()),
        projectiles: Array.from(this.projectiles.values()),
        mines: Array.from(this.mines.values()),
        pickups: Array.from(this.pickups.values()),
        radarReveals: this.radarReveals,
        currentTick,
      };

      const action = ai.update(currentTick, worldState);

      // Process AI action
      if (action.moveTarget) {
        this.commands.set(aiId, {
          kind: "MOVE_TO",
          x: action.moveTarget.x,
          y: action.moveTarget.y,
          clientTick: currentTick,
        });
      }

      if (action.fire) {
        const fireMsg = {
          type: "FIRE",
          weapon: action.fire.weapon,
          aim: action.fire.aim,
        } as any;
        this.handleFire(aiId, fireMsg);
      }

      if (action.useItem) {
        const useItemMsg = {
          type: "USE_ITEM",
          item: action.useItem,
        } as any;
        this.handleUseItem(aiId, useItemMsg);
      }

      if (action.placeMine) {
        const placeMineMsg = {
          type: "PLACE_MINE",
        } as any;
        this.handlePlaceMine(aiId, placeMineMsg);
      }

      if (action.teleport) {
        const teleportMsg = {
          type: "TELEPORT",
          x: action.teleport.x,
          y: action.teleport.y,
        } as any;
        this.handleTeleport(aiId, teleportMsg);
      }
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
