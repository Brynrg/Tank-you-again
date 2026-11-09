import {
  FUEL_CRATE_RESTORE,
  FUEL_DEPOSIT_AMOUNT,
  FUEL_RADAR_SCAN,
  FUEL_SHIELD_PER_SEC,
  FUEL_TELEPORT,
  ItemType,
  KILL_BOUNTY_FUEL_PER_TIER,
  KILL_BOUNTY_XP_PER_TIER,
  LAST_DAMAGER_WINDOW_TICKS,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_FUEL,
  MINE_PICKUP_AMOUNT,
  MISSILE_PICKUP_AMOUNT,
  MilitaryRank,
  PASSIVE_FUEL_REGEN_PER_SEC,
  PICKUP_RADIUS,
  POWER_TIER_DAMAGE_MULT,
  POWER_TIER_FUEL_REWARD,
  POWER_TIER_THRESHOLDS,
  ProjectileKind,
  RADAR_PICKUP_AMOUNT,
  RESPAWN_DELAY_TICKS,
  SHIELD_AUTO_LOWER_TICKS,
  SHIELD_PICKUP_AMOUNT,
  TANK_RADIUS,
  TELEPORT_MAX_RANGE,
  TELEPORT_PICKUP_AMOUNT,
  TICK_MS,
  XP_PER_DEATH,
  XP_PER_KILL,
  TeamColor,
  type GameEvent,
  type GameStateSnapshot,
  type MineState,
  type PickupState,
  type ProjectileState,
  type TankState,
} from "@shared/types";

import { AIEnemy, type AIChallengeLevel } from "./ai-enemy.js";
import { findHit, stepProjectile, tryFire } from "./combat.js";
import { EntityMap } from "./entity-map.js";
import { applyDamage } from "./damage.js";
import { creditFuel, debitFuel } from "./economy.js";
import { randomId } from "./id.js";
import { EMPTY_INPUT, type PlayerCommandState, type PlayerInputState } from "./loop-types.js";
import { applyMineDamage, placeMine, stepMineDetonations } from "./mines.js";
import { stepMoveCommand, stepMovement } from "./movement.js";
import { rankForXp } from "./rank.js";
import { computeVisionSet, scanRadar } from "./vision.js";
import {
  computePowerTier,
  makeTank,
  maybeSpawnPickup,
  pickTeam,
  respawnTank,
  tickSpawnProtection,
} from "./world.js";

interface FireCooldowns {
  lastBulletTick: number;
  lastMissileTick: number;
  lastMineTick: number;
}

/** Default skill spread used when topping up the bot population. */
const DEFAULT_BOT_LADDER: AIChallengeLevel[] = [
  "easy",
  "easy",
  "medium",
  "medium",
  "medium",
  "hard",
  "hard",
  "expert",
];

export interface ArenaOptions {
  /** Bot population to maintain (dead bots respawn in place). */
  aiTargetCount?: number;
  /** Skill spread to cycle through as bots are (re)spawned. */
  botLadder?: AIChallengeLevel[];
  /** Restrict bots to these teams (e.g. so a single human owns BLUE alone). */
  botTeams?: TeamColor[];
  /** Track XP→rank locally (single-player). When false, the embedder owns
   *  progression via the onXpDelta hook (the server persists it). */
  trackXp?: boolean;
}

/**
 * Headless, authoritative tank-arena simulation. This is the single source of
 * truth for game rules: movement, combat, damage, mines, vision, economy, and
 * the computer-player AI. It carries no networking, persistence, or scheduler —
 * an embedder (the single-player client, or the server room loop) advances it
 * with {@link step} and reads masked views with {@link snapshotFor}.
 */
export class Arena {
  public tickIndex = 0;

  private readonly tanks = new EntityMap<string, TankState>();
  private readonly projectiles = new EntityMap<string, ProjectileState>();
  private readonly mines = new EntityMap<string, MineState>();
  private readonly pickups = new EntityMap<string, PickupState>();
  private readonly radarReveals = new Map<string, Map<string, number>>();

  private readonly inputs = new Map<string, PlayerInputState>();
  private readonly commands = new Map<string, PlayerCommandState>();
  private readonly cooldowns = new Map<string, FireCooldowns>();
  private readonly lastInputTick = new Map<string, number>();
  /** Tank ids that are human-controlled (vs AI-driven). */
  private readonly humans = new Set<string>();

  private readonly aiEnemies = new Map<string, AIEnemy>();
  private readonly aiAim = new Map<string, number>();
  private aiCount = 0;

  private readonly teamCensus = new Map<TeamColor, number>();
  private readonly pickupSpawnRef = { value: 0 };
  private pendingEvents: GameEvent[] = [];
  /** Local XP ledger (single-player rank progression). */
  private readonly xp = new Map<string, number>();

  private readonly aiTargetCount: number;
  private readonly botLadder: AIChallengeLevel[];
  private readonly botTeams: TeamColor[] | null;
  private readonly trackXp: boolean;

  /** Optional hook for embedders that own progression (the server). */
  public onXpDelta:
    | ((tankId: string, delta: number, reason: "kill" | "death" | "assist") => void)
    | null = null;

  constructor(opts: ArenaOptions = {}) {
    this.aiTargetCount = opts.aiTargetCount ?? 0;
    this.botLadder = opts.botLadder ?? DEFAULT_BOT_LADDER;
    this.botTeams = opts.botTeams ?? null;
    this.trackXp = opts.trackXp ?? false;
  }

  // ── Membership ────────────────────────────────────────────────────────────

  /** Add a human-controlled tank. */
  addPlayer(args: {
    id?: string;
    name: string;
    team?: TeamColor;
    rank?: MilitaryRank;
    spawn?: { x: number; y: number };
  }): TankState {
    const id = args.id ?? `p-${randomId()}`;
    const team = args.team ?? pickTeam(this.teamCensus);
    const tank = makeTank({
      id,
      name: args.name,
      team,
      rank: args.rank ?? MilitaryRank.RECRUIT,
      currentTick: this.tickIndex,
    });
    if (args.spawn) {
      tank.x = clamp(args.spawn.x, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS);
      tank.y = clamp(args.spawn.y, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS);
    }
    this.tanks.set(id, tank);
    this.humans.add(id);
    this.inputs.set(id, { ...EMPTY_INPUT });
    this.cooldowns.set(id, freshCooldowns());
    this.lastInputTick.set(id, 0);
    this.xp.set(id, 0);
    this.teamCensus.set(team, (this.teamCensus.get(team) ?? 0) + 1);
    this.pendingEvents.push({ tick: this.tickIndex, kind: "respawn", subjectId: id });
    return tank;
  }

  private addAIEnemy(difficulty: AIChallengeLevel): AIEnemy {
    const aiId = `ai-${this.aiCount++}`;
    const team = this.pickBotTeam();
    const ai = new AIEnemy(aiId, team, difficulty);
    this.aiEnemies.set(aiId, ai);
    this.cooldowns.set(aiId, freshCooldowns());
    this.xp.set(aiId, 0);
    this.teamCensus.set(team, (this.teamCensus.get(team) ?? 0) + 1);
    this.tanks.set(aiId, ai.getTank());
    return ai;
  }

  private pickBotTeam(): TeamColor {
    if (!this.botTeams || this.botTeams.length === 0) return pickTeam(this.teamCensus);
    let best = this.botTeams[0]!;
    let bestCount = Infinity;
    for (const t of this.botTeams) {
      const c = this.teamCensus.get(t) ?? 0;
      if (c < bestCount) {
        bestCount = c;
        best = t;
      }
    }
    return best;
  }

  /** Seed the field with a handful of pickups so it isn't barren on frame one. */
  seedPickups(count: number): void {
    for (let i = 0; i < count; i++) {
      // Force a spawn regardless of the interval gate.
      this.pickupSpawnRef.value = -1_000_000;
      maybeSpawnPickup(this.pickups, this.tickIndex, this.pickupSpawnRef);
    }
    this.pickupSpawnRef.value = this.tickIndex;
  }

  // ── Intent ingestion (latest-wins, like the server) ─────────────────────────

  setInput(tankId: string, msg: PlayerInputState): void {
    if (!this.tanks.has(tankId)) return;
    if (msg.clientTick < (this.lastInputTick.get(tankId) ?? 0)) return;
    this.lastInputTick.set(tankId, msg.clientTick);
    this.inputs.set(tankId, {
      up: !!msg.up,
      down: !!msg.down,
      left: !!msg.left,
      right: !!msg.right,
      aim: Number.isFinite(msg.aim) ? msg.aim : 0,
      clientTick: msg.clientTick,
    });
  }

  setMoveTo(tankId: string, x: number, y: number, clientTick: number): void {
    if (!this.tanks.has(tankId)) return;
    if (clientTick < (this.lastInputTick.get(tankId) ?? 0)) return;
    this.lastInputTick.set(tankId, clientTick);
    this.commands.set(tankId, {
      kind: "MOVE_TO",
      x: clamp(x, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS),
      y: clamp(y, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS),
      clientTick,
    });
  }

  setStop(tankId: string, clientTick: number): void {
    if (!this.tanks.has(tankId)) return;
    if (clientTick < (this.lastInputTick.get(tankId) ?? 0)) return;
    this.lastInputTick.set(tankId, clientTick);
    this.commands.set(tankId, { kind: "STOP", clientTick });
  }

  fire(tankId: string, weapon: ProjectileKind, aim: number | undefined): void {
    const tank = this.tanks.get(tankId);
    const cd = this.cooldowns.get(tankId);
    if (!tank || !cd || tank.isDead) return;
    this.fireWeapon(tank, cd, weapon, aim);
  }

  placeMine(tankId: string): void {
    const tank = this.tanks.get(tankId);
    const cd = this.cooldowns.get(tankId);
    if (!tank || !cd || tank.isDead) return;
    this.placeMineFor(tank, cd);
  }

  useItem(tankId: string, item: ItemType): void {
    const tank = this.tanks.get(tankId);
    if (!tank || tank.isDead) return;
    this.useItemFor(tank, item);
  }

  teleport(tankId: string, x: number, y: number): void {
    const tank = this.tanks.get(tankId);
    if (!tank || tank.isDead) return;
    this.teleportFor(tank, x, y);
  }

  /** Drop a fuel canister behind the tank (cost-neutral cache you can return for). */
  depositFuel(tankId: string, amount = FUEL_DEPOSIT_AMOUNT): void {
    const tank = this.tanks.get(tankId);
    if (!tank || tank.isDead || tank.fuel < amount) return;
    tank.fuel -= amount;
    const off = TANK_RADIUS + PICKUP_RADIUS + 12;
    const id = randomId();
    this.pickups.set(id, {
      id,
      type: ItemType.FUEL_CRATE,
      x: clamp(tank.x - Math.cos(tank.angle) * off, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS),
      y: clamp(tank.y - Math.sin(tank.angle) * off, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS),
    });
  }

  // ── Step ────────────────────────────────────────────────────────────────────

  /** Advance one fixed simulation step. */
  step(): void {
    this.tickIndex += 1;
    const t = this.tickIndex;
    const dt = TICK_MS / 1000;

    this.updateAIEnemies();

    // Drive every tank with its current input/command. Bots feed their desired
    // turret aim through a synthetic input.
    for (const [id, tank] of this.tanks) {
      const input = this.humans.has(id)
        ? (this.inputs.get(id) ?? EMPTY_INPUT)
        : {
            ...EMPTY_INPUT,
            aim: this.aiAim.get(id) ?? tank.turretAngle,
            clientTick: t,
          };
      this.driveTank(tank, input, this.commands.get(id), id, t, dt);
    }

    // Projectiles.
    for (const [id, p] of this.projectiles) {
      if (!stepProjectile(p, t, dt)) {
        this.projectiles.delete(id);
        continue;
      }
      const hit = findHit(p, this.tanks.valuesArray());
      if (hit) {
        const result = applyDamage(hit, p.damage, p.ownerId);
        this.projectiles.delete(id);
        if (result === "killed") this.killTank(hit, p.ownerId);
      }
    }

    // Mines.
    const dets = stepMineDetonations(this.mines.valuesArray(), this.tanks.valuesArray(), t);
    for (const det of dets) {
      this.mines.delete(det.mine.id);
      this.forgetRadarEntity(det.mine.id);
      this.pendingEvents.push({ tick: t, kind: "mine_detonate", subjectId: det.mine.ownerId });
      const killed = applyMineDamage(det);
      for (const v of killed) this.killTank(v, det.mine.ownerId);
    }

    // Pickups.
    maybeSpawnPickup(this.pickups, t, this.pickupSpawnRef);
    this.collectPickups();
  }

  /** The events produced during the most recent {@link step}. */
  drainEvents(): GameEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private driveTank(
    tank: TankState,
    input: PlayerInputState,
    command: PlayerCommandState | undefined,
    key: string,
    t: number,
    dt: number,
  ): void {
    if (tank.isDead) {
      if (t >= tank.respawnAtTick) respawnTank(tank, t);
      return;
    }
    // Passive fuel regeneration — slows death spiral, rewards survival.
    if (tank.fuel < MAX_FUEL) {
      tank.fuel = Math.min(MAX_FUEL, tank.fuel + PASSIVE_FUEL_REGEN_PER_SEC * dt);
    }
    if (tank.ticksSinceDamaged !== undefined) tank.ticksSinceDamaged += 1;
    if (tank.hasShield) {
      // Auto-lower once neither raised nor damaged recently — a shield idling
      // against no fire is pure fuel bleed (the playtest death-trap).
      const sinceRaised = t - (tank.shieldRaisedAtTick ?? 0);
      const sinceDamaged = tank.ticksSinceDamaged ?? Number.MAX_SAFE_INTEGER;
      if (sinceRaised >= SHIELD_AUTO_LOWER_TICKS && sinceDamaged >= SHIELD_AUTO_LOWER_TICKS) {
        tank.hasShield = false;
      } else if (!debitFuel(tank, FUEL_SHIELD_PER_SEC * dt, "SHIELD")) {
        tank.hasShield = false;
      }
    }
    if (command?.kind === "MOVE_TO") {
      if (stepMoveCommand(tank, command, input.aim, dt)) this.commands.delete(key);
    } else if (command?.kind === "STOP") {
      this.commands.delete(key);
      tank.turretAngle = input.aim;
    } else {
      stepMovement(tank, input, dt);
    }
    if (tank.fuel <= 0) {
      // Credit the last damager inside the window instead of leaking the kill.
      const recent = (tank.ticksSinceDamaged ?? Infinity) <= LAST_DAMAGER_WINDOW_TICKS;
      this.killTank(tank, recent ? (tank.lastDamagerId ?? null) : null);
      return;
    }
    if (tickSpawnProtection(tank, t)) {
      this.pendingEvents.push({ tick: t, kind: "spawn_protected_end", subjectId: tank.id });
    }
  }

  private updateAIEnemies(): void {
    const t = this.tickIndex;
    while (this.aiEnemies.size < this.aiTargetCount) {
      const tier = this.botLadder[this.aiCount % this.botLadder.length] ?? "medium";
      this.addAIEnemy(tier);
    }

    if (this.aiEnemies.size > 0) {
      const cachedWorldState = {
        tanks: this.tanks.valuesArray(),
        projectiles: this.projectiles.valuesArray(),
        mines: this.mines.valuesArray(),
        pickups: this.pickups.valuesArray(),
        radarReveals: this.radarReveals,
        currentTick: t,
      };

      for (const [aiId, ai] of this.aiEnemies) {
        const tank = this.tanks.get(aiId);
        if (!tank || tank.isDead) continue;
        const cd = this.cooldowns.get(aiId);
        if (!cd) continue;

        const action = ai.update(t, cachedWorldState);

        let moveTarget = action.moveTarget;
        if (!moveTarget && !this.commands.has(aiId)) {
          moveTarget = {
            x: TANK_RADIUS + Math.random() * (MAP_WIDTH - 2 * TANK_RADIUS),
            y: TANK_RADIUS + Math.random() * (MAP_HEIGHT - 2 * TANK_RADIUS),
          };
        }
        if (moveTarget) {
          this.commands.set(aiId, {
            kind: "MOVE_TO",
            x: clamp(moveTarget.x, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS),
            y: clamp(moveTarget.y, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS),
            clientTick: t,
          });
        }
        if (action.fire) {
          this.aiAim.set(aiId, action.fire.aim);
          this.fireWeapon(tank, cd, action.fire.weapon as ProjectileKind, action.fire.aim);
        }
        if (action.useItem) this.useItemFor(tank, action.useItem as ItemType);
        if (action.placeMine) this.placeMineFor(tank, cd);
        if (action.teleport) this.teleportFor(tank, action.teleport.x, action.teleport.y);
      }
    }
  }

  private fireWeapon(
    tank: TankState,
    cd: FireCooldowns,
    weapon: ProjectileKind,
    aim: number | undefined,
  ): void {
    const lastTick = weapon === ProjectileKind.MISSILE ? cd.lastMissileTick : cd.lastBulletTick;
    const tier = tank.powerTier ?? 0;
    const damageMult = POWER_TIER_DAMAGE_MULT[tier] ?? 1.0;
    const r = tryFire(tank, weapon, aim, this.tickIndex, lastTick, damageMult);
    if (!r.ok || !r.projectile) return;
    this.projectiles.set(r.projectile.id, r.projectile);
    if (weapon === ProjectileKind.MISSILE) cd.lastMissileTick = this.tickIndex;
    else cd.lastBulletTick = this.tickIndex;
  }

  private placeMineFor(tank: TankState, cd: FireCooldowns): void {
    if (this.tickIndex - cd.lastMineTick < 20) return;
    const r = placeMine(tank, this.tickIndex);
    if (!r.ok || !r.mine) return;
    this.mines.set(r.mine.id, r.mine);
    cd.lastMineTick = this.tickIndex;
  }

  private useItemFor(tank: TankState, item: ItemType): void {
    if (item === ItemType.SHIELD) {
      if (tank.hasShield) {
        tank.hasShield = false;
        return;
      }
      if (tank.ammo.shields <= 0) return;
      tank.ammo.shields -= 1;
      tank.hasShield = true;
      tank.shieldRaisedAtTick = this.tickIndex;
    } else if (item === ItemType.RADAR) {
      if (tank.ammo.radar <= 0) return;
      if (!debitFuel(tank, FUEL_RADAR_SCAN, "RADAR")) return;
      tank.ammo.radar -= 1;
      const result = scanRadar(
        tank,
        { mines: this.mines.valuesArray(), pickups: this.pickups.valuesArray() },
        this.getRadarReveals(tank.id),
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

  private teleportFor(tank: TankState, x: number, y: number): void {
    if (tank.ammo.teleports <= 0) return;
    if (Math.hypot(x - tank.x, y - tank.y) > TELEPORT_MAX_RANGE) return;
    if (!debitFuel(tank, FUEL_TELEPORT, "TELEPORT")) return;
    tank.ammo.teleports -= 1;
    tank.x = clamp(x, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS);
    tank.y = clamp(y, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS);
  }

  private collectPickups(): void {
    const r2 = (PICKUP_RADIUS + TANK_RADIUS) * (PICKUP_RADIUS + TANK_RADIUS);
    const tanksArr = this.tanks.valuesArray();
    for (const [id, pk] of this.pickups) {
      for (let i = 0; i < tanksArr.length; i++) {
        const t = tanksArr[i]!;
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

    victim.killStreak = 0;

    if (killerId && killerId !== victim.id) {
      const killer = this.tanks.get(killerId);
      if (killer) {
        // Remember where the hunter stood — respawn placement avoids it.
        victim.lastKillerX = killer.x;
        victim.lastKillerY = killer.y;
        killer.kills = (killer.kills ?? 0) + 1;
        killer.killStreak = (killer.killStreak ?? 0) + 1;

        this.pendingEvents.push({
          tick: this.tickIndex,
          kind: "kill",
          subjectId: killerId,
          objectId: victim.id,
          payload: String(killer.killStreak),
        });

        // Power-tier advancement
        const newTier = computePowerTier(killer.kills);
        if (newTier > (killer.powerTier ?? 0)) {
          killer.powerTier = newTier;
          const reward = POWER_TIER_FUEL_REWARD[newTier] ?? 0;
          killer.fuel = Math.min(MAX_FUEL, killer.fuel + reward);
          this.pendingEvents.push({
            tick: this.tickIndex,
            kind: "tier_up",
            subjectId: killerId,
            payload: String(newTier),
          });
        }

        // Bounty scales with the VICTIM's tier: hunting the leader pays more
        // than farming the rookie (comeback pressure).
        const victimTier = victim.powerTier ?? 0;
        if (victimTier > 0) creditFuel(killer, victimTier * KILL_BOUNTY_FUEL_PER_TIER);
        const xpReward = XP_PER_KILL + victimTier * KILL_BOUNTY_XP_PER_TIER;
        this.awardXp(killerId, xpReward);
        this.onXpDelta?.(killerId, xpReward, "kill");
      }
    }
    this.awardXp(victim.id, XP_PER_DEATH);
    this.onXpDelta?.(victim.id, XP_PER_DEATH, "death");
  }

  /** Local XP→rank progression (single-player). No-op when trackXp is off. */
  private awardXp(tankId: string, delta: number): void {
    if (!this.trackXp) return;
    const tank = this.tanks.get(tankId);
    if (!tank) return;
    const next = Math.max(0, (this.xp.get(tankId) ?? 0) + delta);
    this.xp.set(tankId, next);
    const promoted = rankForXp(next);
    if (promoted !== tank.rank) {
      tank.rank = promoted;
      this.pendingEvents.push({ tick: this.tickIndex, kind: "rank_up", subjectId: tankId });
    }
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
    for (const reveals of this.radarReveals.values()) reveals.delete(entityId);
  }

  // ── Views ────────────────────────────────────────────────────────────────

  /**
   * Build a snapshot from one tank's point of view. With `maskVision` (the
   * server default) only what the viewer can see is included; single-player
   * passes `false` for full battlefield awareness, but enemy mines are always
   * masked (radar/ally only).
   */
  snapshotFor(viewerId: string, maskVision = true): GameStateSnapshot {
    const viewer = this.tanks.get(viewerId);
    const vis = viewer
      ? computeVisionSet(
          viewer,
          {
            tanks: this.tanks.valuesArray(),
            projectiles: this.projectiles.valuesArray(),
            mines: this.mines.valuesArray(),
            pickups: this.pickups.valuesArray(),
            radarReveals: this.radarReveals.get(viewerId) ?? new Map<string, number>(),
          },
          this.tickIndex,
        )
      : null;

    const tanks: TankState[] = [];
    const tanksArr = this.tanks.valuesArray();
    for (let i = 0; i < tanksArr.length; i++) {
      const tnk = tanksArr[i]!;
      if (!maskVision || !vis || vis.visibleTankIds.has(tnk.id)) tanks.push(tnk);
    }
    const projectiles: ProjectileState[] = [];
    const projectilesArr = this.projectiles.valuesArray();
    for (let i = 0; i < projectilesArr.length; i++) {
      const p = projectilesArr[i]!;
      if (!maskVision || !vis || vis.visibleProjectileIds.has(p.id)) projectiles.push(p);
    }
    const pickups: PickupState[] = [];
    const pickupsArr = this.pickups.valuesArray();
    for (let i = 0; i < pickupsArr.length; i++) {
      const pk = pickupsArr[i]!;
      if (!maskVision || !vis || vis.visiblePickupIds.has(pk.id)) pickups.push(pk);
    }
    // Enemy mines are always masked (own/ally/radar only), even in single-player.
    const visibleMines: MineState[] = [];
    const minesArr = this.mines.valuesArray();
    for (let i = 0; i < minesArr.length; i++) {
      const m = minesArr[i]!;
      if (!vis || vis.visibleMineIds.has(m.id)) visibleMines.push(m);
    }

    return {
      tick: this.tickIndex,
      timestamp: 0,
      tanks,
      projectiles,
      pickups,
      visibleMines,
      events: [],
    };
  }
}

function freshCooldowns(): FireCooldowns {
  return { lastBulletTick: -1_000_000, lastMissileTick: -1_000_000, lastMineTick: -1_000_000 };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
