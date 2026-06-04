import {
  ClientMessageType,
  ItemType,
  MilitaryRank,
  ProjectileKind,
  ServerMessageType,
  TeamColor,
  BULLET_COOLDOWN_TICKS,
  BULLET_DAMAGE,
  BULLET_SPEED,
  BULLET_TTL_TICKS,
  COMMAND_ARRIVAL_RADIUS,
  FUEL_FIRE_BULLET,
  FUEL_FIRE_MISSILE,
  FUEL_MINE,
  FUEL_MOVE_PER_SEC,
  FUEL_RADAR_SCAN,
  FUEL_SHIELD_PER_SEC,
  FUEL_TELEPORT,
  INITIAL_MINES,
  INITIAL_MISSILES,
  INITIAL_RADAR,
  INITIAL_SHIELDS,
  INITIAL_TELEPORTS,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_FUEL,
  MINE_COOLDOWN_TICKS,
  MINE_DAMAGE,
  MINE_RADIUS,
  MISSILE_COOLDOWN_TICKS,
  MISSILE_DAMAGE,
  MISSILE_SPEED,
  MISSILE_TTL_TICKS,
  RANK_ORDER,
  RANK_XP_THRESHOLDS,
  XP_PER_KILL,
  PICKUP_MAX_ACTIVE,
  PICKUP_RADIUS,
  PICKUP_SPAWN_INTERVAL_TICKS,
  RADAR_DETECT_TICKS,
  RESPAWN_DELAY_TICKS,
  SERVER_TICK_RATE,
  SPAWN_PROTECTION_TICKS,
  TANK_RADIUS,
  TANK_SPEED,
  TELEPORT_MAX_RANGE,
  TICK_MS,
  type ClientMessage,
  type GameEvent,
  type GameStateSnapshot,
  type MineState,
  type PickupState,
  type ProjectileState,
  type ServerMessage,
  type TankState,
} from "@shared/types";

export type NetStatus = "connected" | "connecting" | "closed";

/** dt for a single fixed simulation step, in seconds. */
const DT = 1 / SERVER_TICK_RATE;
/** Distance at which computer players open fire on a target. */
const AI_ENGAGE_RANGE = 620;
/** Distance computer players prefer to keep from their target (kite radius). */
const AI_PREFERRED_RANGE = 260;

/** Skill tiers for the computer-controlled players. */
type BotDifficulty = "easy" | "medium" | "hard";

/** Per-tier behavior tuning. Higher tiers aim truer, lead their shots, use
 *  missiles/shield/mines, and look after their fuel sooner. */
const BOT_TUNING: Record<
  BotDifficulty,
  {
    /** Per-tick chance to attempt a bullet while a target is in range (the fire
     *  cooldown still caps the actual rate). */
    fireChance: number;
    /** Random aim error in radians (smaller = more accurate). */
    aimJitter: number;
    /** How much to lead a moving target (0 = aim at current position). */
    lead: number;
    /** Per-tick chance to launch a missile when one is worthwhile. */
    missileChance: number;
    /** Raise the shield when an enemy is closer than this (0 = never). */
    shieldDist: number;
    /** Per-tick chance to drop a mine while kiting a close chaser. */
    mineChance: number;
    /** Go refuel when fuel drops below this. */
    lowFuel: number;
  }
> = {
  easy: {
    fireChance: 0.5,
    aimJitter: 0.32,
    lead: 0,
    missileChance: 0,
    shieldDist: 0,
    mineChance: 0.002,
    lowFuel: 140,
  },
  medium: {
    fireChance: 0.85,
    aimJitter: 0.13,
    lead: 0.55,
    missileChance: 0.06,
    shieldDist: 170,
    mineChance: 0.01,
    lowFuel: 260,
  },
  hard: {
    fireChance: 1,
    aimJitter: 0.05,
    lead: 1,
    missileChance: 0.14,
    shieldDist: 240,
    mineChance: 0.02,
    lowFuel: 340,
  },
};

/** Per-tank runtime state that lives outside the wire-format `TankState`. */
interface TankBrain {
  vx: number;
  vy: number;
  moveTarget: { x: number; y: number } | null;
  /** Held movement keys (player only). */
  keys: { up: boolean; down: boolean; left: boolean; right: boolean };
  aim: number;
  lastBulletTick: number;
  lastMissileTick: number;
  lastMineTick: number;
  shieldUntilTick: number;
  radarUntilTick: number;
  kills: number;
  /** Accumulated experience; drives rank promotion. */
  xp: number;
  isBot: boolean;
  /** Skill tier (bots only; ignored for the player). */
  difficulty: BotDifficulty;
  /** AI wander heading, re-rolled periodically. */
  wanderUntilTick: number;
  wanderAngle: number;
}

const BOT_NAMES = ["Viper", "Rhino", "Havoc", "Talon", "Bishop", "Ghost", "Ironclad"];
const BOT_TEAMS = [TeamColor.RED, TeamColor.ORANGE, TeamColor.PURPLE];

/**
 * Fully local, single-player game engine. Implements the same observable
 * contract as the multiplayer {@link NetClient}: callers `send()` client
 * intents and receive authoritative `SNAPSHOT` messages via `onMessage`.
 *
 * The world is ticked on a fixed 20 Hz timer (matching SERVER_TICK_RATE) and
 * drives a player tank plus a handful of AI opponents, pickups, projectiles
 * and mines — enough to make the canvas renderer come alive offline.
 */
export class SinglePlayerNetClient {
  private status: NetStatus = "connected";
  private readonly onMessage: (msg: ServerMessage) => void;
  private readonly onStatus?: (status: NetStatus) => void;

  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  private tanks: TankState[] = [];
  private brains = new Map<string, TankBrain>();
  private projectiles: ProjectileState[] = [];
  private mines: MineState[] = [];
  private pickups: PickupState[] = [];
  private events: GameEvent[] = [];

  private nextId = 1;
  private playerId = "";

  constructor(options: {
    onMessage: (msg: ServerMessage) => void;
    onStatus?: (status: NetStatus) => void;
  }) {
    this.onMessage = options.onMessage;
    this.onStatus = options.onStatus;

    // Announce "connected" so the HUD doesn't sit on "connecting" forever —
    // the local engine is authoritative and always available.
    this.onStatus?.(this.status);

    this.spawnWorld();

    // Announce the local "server" before the first frame renders.
    this.onMessage({
      type: ServerMessageType.WELCOME,
      yourTankId: this.playerId,
      yourTeam: TeamColor.BLUE,
      serverTickRate: SERVER_TICK_RATE,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
    });
    this.emitSnapshot();

    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  // ---------- public client contract ----------

  /** Receive a client intent and fold it into the local player's state. */
  send(msg: ClientMessage): void {
    const brain = this.brains.get(this.playerId);
    const tank = this.tanks.find((t) => t.id === this.playerId);
    if (!brain || !tank || tank.isDead) return;

    switch (msg.type) {
      case ClientMessageType.INPUT: {
        brain.aim = msg.aim;
        tank.turretAngle = msg.aim;
        const anyKey = msg.up || msg.down || msg.left || msg.right;
        brain.keys = { up: msg.up, down: msg.down, left: msg.left, right: msg.right };
        if (anyKey) brain.moveTarget = null; // manual driving overrides move-to
        break;
      }
      case ClientMessageType.MOVE_TO: {
        brain.moveTarget = { x: clamp(msg.x, 0, MAP_WIDTH), y: clamp(msg.y, 0, MAP_HEIGHT) };
        brain.keys = { up: false, down: false, left: false, right: false };
        break;
      }
      case ClientMessageType.STOP: {
        brain.moveTarget = null;
        brain.keys = { up: false, down: false, left: false, right: false };
        break;
      }
      case ClientMessageType.FIRE: {
        const aim = msg.aim ?? brain.aim;
        if (msg.weapon === ProjectileKind.MISSILE) this.tryFireMissile(tank, brain, aim);
        else this.tryFireBullet(tank, brain, aim);
        break;
      }
      case ClientMessageType.PLACE_MINE: {
        this.tryPlaceMine(tank, brain);
        break;
      }
      case ClientMessageType.USE_ITEM: {
        this.useItem(tank, brain, msg.item);
        break;
      }
      case ClientMessageType.TELEPORT: {
        this.tryTeleport(tank, brain, msg.x, msg.y);
        break;
      }
      case ClientMessageType.DEPOSIT_FUEL: {
        this.depositFuel(tank, msg.amount);
        break;
      }
      default:
        break;
    }
  }

  getStatus(): NetStatus {
    return this.status;
  }

  getRttMs(): number {
    return 0;
  }

  getServerTick(): number {
    return this.tick;
  }

  close(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = "closed";
    this.onStatus?.(this.status);
  }

  // ---------- world setup ----------

  private spawnWorld(): void {
    // Player tank in the centre.
    const player = this.makeTank("You", TeamColor.BLUE, false, MAP_WIDTH / 2, MAP_HEIGHT / 2);
    this.playerId = player.id;
    this.tanks.push(player);

    // AI opponents scale with the (3× larger) arena. Spread them across the
    // whole map, keeping a safe gap from the player's central spawn so you
    // aren't dogpiled the instant you deploy.
    const botCount = 9;
    // A spread of skill so the field has fodder, regulars, and a couple of
    // genuine threats rather than nine identical bots.
    const ladder: BotDifficulty[] = [
      "easy",
      "easy",
      "easy",
      "medium",
      "medium",
      "medium",
      "medium",
      "hard",
      "hard",
    ];
    for (let i = 0; i < botCount; i++) {
      const name = BOT_NAMES[i % BOT_NAMES.length]!;
      const team = BOT_TEAMS[i % BOT_TEAMS.length]!;
      const difficulty = ladder[i] ?? "medium";
      let x = 0;
      let y = 0;
      do {
        x = TANK_RADIUS + Math.random() * (MAP_WIDTH - TANK_RADIUS * 2);
        y = TANK_RADIUS + Math.random() * (MAP_HEIGHT - TANK_RADIUS * 2);
      } while (Math.hypot(x - MAP_WIDTH / 2, y - MAP_HEIGHT / 2) < 650);
      this.tanks.push(this.makeTank(name, team, true, x, y, difficulty));
    }

    // Seed pickups across the larger field so it isn't barren on frame one.
    for (let i = 0; i < 18; i++) this.spawnPickup();
  }

  private makeTank(
    name: string,
    team: TeamColor,
    isBot: boolean,
    x: number,
    y: number,
    difficulty: BotDifficulty = "medium",
  ): TankState {
    const id = `t${this.nextId++}`;
    const tank: TankState = {
      id,
      name,
      team,
      rank: MilitaryRank.RECRUIT,
      x,
      y,
      angle: 0,
      turretAngle: 0,
      fuel: MAX_FUEL,
      hasShield: false,
      ammo: {
        missiles: INITIAL_MISSILES,
        mines: INITIAL_MINES,
        teleports: INITIAL_TELEPORTS,
        shields: INITIAL_SHIELDS,
        radar: INITIAL_RADAR,
      },
      isSpawnProtected: true,
      spawnProtectedUntilTick: this.tick + SPAWN_PROTECTION_TICKS,
      isDead: false,
      respawnAtTick: 0,
      kills: 0,
      armor: { front: 100, side: 100, rear: 100 },
    };
    this.brains.set(id, {
      vx: 0,
      vy: 0,
      moveTarget: null,
      keys: { up: false, down: false, left: false, right: false },
      aim: 0,
      lastBulletTick: -999,
      lastMissileTick: -999,
      lastMineTick: -999,
      shieldUntilTick: 0,
      radarUntilTick: 0,
      kills: 0,
      xp: 0,
      isBot,
      difficulty,
      wanderUntilTick: 0,
      wanderAngle: Math.random() * Math.PI * 2,
    });
    return tank;
  }

  // ---------- simulation step ----------

  private step(): void {
    this.tick++;
    this.events = [];

    this.thinkBots();
    this.moveTanks();
    this.moveProjectiles();
    this.updateMines();
    this.updatePickups();
    this.updateLifecycle();

    this.emitSnapshot();
  }

  private thinkBots(): void {
    for (const bot of this.tanks) {
      const brain = this.brains.get(bot.id)!;
      if (!brain.isBot || bot.isDead) continue;
      const tune = BOT_TUNING[brain.difficulty];

      // 1) Survival first: when fuel is low, break off and refuel. Fuel is
      //    health here, so a bot that ignores it just bleeds out.
      if (bot.fuel < tune.lowFuel) {
        const crate = this.nearestPickup(bot, true) ?? this.nearestPickup(bot, false);
        if (crate) {
          brain.moveTarget = { x: crate.x, y: crate.y };
          // Still shoot back / shield if an enemy is right on top of us.
          const threat = this.nearestEnemy(bot);
          if (threat) {
            const td = Math.hypot(threat.x - bot.x, threat.y - bot.y) || 1;
            const aim = Math.atan2(threat.y - bot.y, threat.x - bot.x);
            brain.aim = aim;
            bot.turretAngle = aim;
            if (td < AI_ENGAGE_RANGE && !bot.isSpawnProtected && Math.random() < tune.fireChance) {
              this.tryFireBullet(bot, brain, aim + this.aimError(tune));
            }
            this.maybeShield(bot, brain, tune, td);
          }
          continue;
        }
      }

      const target = this.nearestEnemy(bot);
      if (target) {
        const dx = target.x - bot.x;
        const dy = target.y - bot.y;
        const dist = Math.hypot(dx, dy) || 1;
        // Lead the target so shots connect at range (tier-scaled).
        const aim = this.leadAim(bot, target, BULLET_SPEED, tune.lead);
        brain.aim = aim;
        bot.turretAngle = aim;

        // Kite: close when far, retreat when too close, strafe in the band so
        // the bot is a moving target instead of standing still.
        if (dist > AI_PREFERRED_RANGE + 40) {
          brain.moveTarget = { x: bot.x + (dx / dist) * 140, y: bot.y + (dy / dist) * 140 };
        } else if (dist < AI_PREFERRED_RANGE - 40) {
          brain.moveTarget = { x: bot.x - (dx / dist) * 140, y: bot.y - (dy / dist) * 140 };
        } else {
          const side = bot.id.charCodeAt(bot.id.length - 1) % 2 === 0 ? 1 : -1;
          brain.moveTarget = {
            x: bot.x - (dy / dist) * 120 * side,
            y: bot.y + (dx / dist) * 120 * side,
          };
        }

        if (dist < AI_ENGAGE_RANGE && !bot.isSpawnProtected) {
          // Bullets — cooldown caps the rate; fireChance gates uptime by tier.
          if (Math.random() < tune.fireChance) {
            this.tryFireBullet(bot, brain, aim + this.aimError(tune));
          }
          // Missiles — occasional burst when one is worth spending.
          if (bot.ammo.missiles > 0 && dist > 120 && Math.random() < tune.missileChance) {
            const maim = this.leadAim(bot, target, MISSILE_SPEED, tune.lead);
            this.tryFireMissile(bot, brain, maim + this.aimError(tune) * 0.5);
          }
          // Drop a mine for a close chaser.
          if (dist < AI_PREFERRED_RANGE && bot.ammo.mines > 0 && Math.random() < tune.mineChance) {
            this.tryPlaceMine(bot, brain);
          }
          // Raise shield when an enemy is in the danger band.
          this.maybeShield(bot, brain, tune, dist);
        }
      } else if (this.tick >= brain.wanderUntilTick) {
        // No enemy in sight — grab nearby loot if any, else wander.
        const loot = this.nearestPickup(bot, false);
        if (loot && Math.hypot(loot.x - bot.x, loot.y - bot.y) < 700) {
          brain.moveTarget = { x: loot.x, y: loot.y };
          brain.wanderUntilTick = this.tick + SERVER_TICK_RATE * 2;
        } else {
          brain.wanderAngle = Math.random() * Math.PI * 2;
          brain.wanderUntilTick = this.tick + SERVER_TICK_RATE * (2 + Math.random() * 3);
          brain.moveTarget = {
            x: clamp(
              bot.x + Math.cos(brain.wanderAngle) * 300,
              TANK_RADIUS,
              MAP_WIDTH - TANK_RADIUS,
            ),
            y: clamp(
              bot.y + Math.sin(brain.wanderAngle) * 300,
              TANK_RADIUS,
              MAP_HEIGHT - TANK_RADIUS,
            ),
          };
        }
      }
    }
  }

  /** Random aim error in radians for a tier (lower tiers miss more). */
  private aimError(tune: { aimJitter: number }): number {
    return (Math.random() - 0.5) * 2 * tune.aimJitter;
  }

  /** Raise the shield when an enemy is inside the tier's danger band and we can
   *  afford it. */
  private maybeShield(
    bot: TankState,
    brain: TankBrain,
    tune: { shieldDist: number; lowFuel: number },
    dist: number,
  ): void {
    if (tune.shieldDist <= 0) return;
    if (
      dist < tune.shieldDist &&
      !bot.hasShield &&
      bot.ammo.shields > 0 &&
      bot.fuel > tune.lowFuel
    ) {
      this.useItem(bot, brain, ItemType.SHIELD);
    }
  }

  /** Aim that leads a moving target so projectiles connect at range. Estimates
   *  target velocity from its current move command (bots always have one). */
  private leadAim(self: TankState, target: TankState, projSpeed: number, lead: number): number {
    let tx = target.x;
    let ty = target.y;
    if (lead > 0) {
      const tb = this.brains.get(target.id);
      if (tb?.moveTarget) {
        const vdx = tb.moveTarget.x - target.x;
        const vdy = tb.moveTarget.y - target.y;
        const vlen = Math.hypot(vdx, vdy) || 1;
        const dist = Math.hypot(target.x - self.x, target.y - self.y);
        const tHit = (dist / projSpeed) * lead;
        tx += (vdx / vlen) * TANK_SPEED * tHit;
        ty += (vdy / vlen) * TANK_SPEED * tHit;
      }
    }
    return Math.atan2(ty - self.y, tx - self.x);
  }

  /** Nearest pickup to a tank, optionally restricted to fuel crates. */
  private nearestPickup(self: TankState, fuelOnly: boolean): PickupState | null {
    let best: PickupState | null = null;
    let bestD = Infinity;
    for (const p of this.pickups) {
      if (fuelOnly && p.type !== ItemType.FUEL_CRATE) continue;
      const d = Math.hypot(p.x - self.x, p.y - self.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private moveTanks(): void {
    for (const tank of this.tanks) {
      if (tank.isDead) continue;
      const brain = this.brains.get(tank.id)!;

      let dirX = 0;
      let dirY = 0;
      if (brain.keys.up) dirY -= 1;
      if (brain.keys.down) dirY += 1;
      if (brain.keys.left) dirX -= 1;
      if (brain.keys.right) dirX += 1;

      if (dirX !== 0 || dirY !== 0) {
        const len = Math.hypot(dirX, dirY);
        dirX /= len;
        dirY /= len;
      } else if (brain.moveTarget) {
        const dx = brain.moveTarget.x - tank.x;
        const dy = brain.moveTarget.y - tank.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= COMMAND_ARRIVAL_RADIUS) {
          brain.moveTarget = null;
        } else {
          dirX = dx / dist;
          dirY = dy / dist;
        }
      }

      const moving = (dirX !== 0 || dirY !== 0) && tank.fuel > 0;
      if (moving) {
        tank.x = clamp(tank.x + dirX * TANK_SPEED * DT, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS);
        tank.y = clamp(tank.y + dirY * TANK_SPEED * DT, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS);
        tank.angle = Math.atan2(dirY, dirX);
        tank.fuel = Math.max(0, tank.fuel - FUEL_MOVE_PER_SEC * DT);
      }

      // Active shield burns fuel and pops when it runs out or expires.
      if (tank.hasShield) {
        tank.fuel = Math.max(0, tank.fuel - FUEL_SHIELD_PER_SEC * DT);
        if (this.tick >= brain.shieldUntilTick || tank.fuel <= 0) tank.hasShield = false;
      }

      // Out of fuel is fatal.
      if (tank.fuel <= 0) this.killTank(tank, null);
    }
  }

  private moveProjectiles(): void {
    const survivors: ProjectileState[] = [];
    for (const proj of this.projectiles) {
      proj.x += proj.vx * DT;
      proj.y += proj.vy * DT;

      if (
        this.tick >= proj.expiresAtTick ||
        proj.x < 0 ||
        proj.y < 0 ||
        proj.x > MAP_WIDTH ||
        proj.y > MAP_HEIGHT
      ) {
        continue;
      }

      let hit = false;
      for (const tank of this.tanks) {
        if (tank.isDead || tank.id === proj.ownerId) continue;
        if (this.sameTeam(tank.id, proj.ownerId)) continue;
        if (Math.hypot(tank.x - proj.x, tank.y - proj.y) <= TANK_RADIUS) {
          this.damageTank(tank, proj.damage, proj.ownerId);
          hit = true;
          break;
        }
      }
      if (!hit) survivors.push(proj);
    }
    this.projectiles = survivors;
  }

  private updateMines(): void {
    const survivors: MineState[] = [];
    for (const mine of this.mines) {
      let detonated = false;
      for (const tank of this.tanks) {
        if (tank.isDead || tank.id === mine.ownerId) continue;
        if (tank.team === mine.ownerTeam) continue;
        if (Math.hypot(tank.x - mine.x, tank.y - mine.y) <= MINE_RADIUS) {
          this.damageTank(tank, MINE_DAMAGE, mine.ownerId);
          this.events.push({ tick: this.tick, kind: "mine_detonate", subjectId: tank.id });
          detonated = true;
          break;
        }
      }
      if (!detonated) survivors.push(mine);
    }
    this.mines = survivors;
  }

  private updatePickups(): void {
    // Collect pickups.
    const survivors: PickupState[] = [];
    for (const pk of this.pickups) {
      let taken = false;
      for (const tank of this.tanks) {
        if (tank.isDead) continue;
        if (Math.hypot(tank.x - pk.x, tank.y - pk.y) <= TANK_RADIUS + PICKUP_RADIUS) {
          this.applyPickup(tank, pk);
          this.events.push({
            tick: this.tick,
            kind: "pickup",
            subjectId: tank.id,
            payload: pk.type,
          });
          taken = true;
          break;
        }
      }
      if (!taken) survivors.push(pk);
    }
    this.pickups = survivors;

    // Periodically replenish.
    if (this.tick % PICKUP_SPAWN_INTERVAL_TICKS === 0 && this.pickups.length < PICKUP_MAX_ACTIVE) {
      this.spawnPickup();
    }
  }

  private updateLifecycle(): void {
    for (const tank of this.tanks) {
      tank.isSpawnProtected = this.tick < tank.spawnProtectedUntilTick;
      if (tank.isDead && this.tick >= tank.respawnAtTick) this.respawn(tank);
    }
  }

  // ---------- weapons & items ----------

  private tryFireBullet(tank: TankState, brain: TankBrain, aim: number): void {
    if (this.tick - brain.lastBulletTick < BULLET_COOLDOWN_TICKS) return;
    if (tank.fuel < FUEL_FIRE_BULLET) return;
    brain.lastBulletTick = this.tick;
    tank.fuel -= FUEL_FIRE_BULLET;
    this.spawnProjectile(
      tank,
      aim,
      ProjectileKind.BULLET,
      BULLET_SPEED,
      BULLET_DAMAGE,
      BULLET_TTL_TICKS,
    );
  }

  private tryFireMissile(tank: TankState, brain: TankBrain, aim: number): void {
    if (this.tick - brain.lastMissileTick < MISSILE_COOLDOWN_TICKS) return;
    if (tank.ammo.missiles <= 0 || tank.fuel < FUEL_FIRE_MISSILE) return;
    brain.lastMissileTick = this.tick;
    tank.ammo.missiles--;
    tank.fuel -= FUEL_FIRE_MISSILE;
    this.spawnProjectile(
      tank,
      aim,
      ProjectileKind.MISSILE,
      MISSILE_SPEED,
      MISSILE_DAMAGE,
      MISSILE_TTL_TICKS,
    );
  }

  private spawnProjectile(
    tank: TankState,
    aim: number,
    kind: ProjectileKind,
    speed: number,
    damage: number,
    ttlTicks: number,
  ): void {
    const muzzle = TANK_RADIUS + 6;
    this.projectiles.push({
      id: `p${this.nextId++}`,
      ownerId: tank.id,
      kind,
      x: tank.x + Math.cos(aim) * muzzle,
      y: tank.y + Math.sin(aim) * muzzle,
      vx: Math.cos(aim) * speed,
      vy: Math.sin(aim) * speed,
      damage,
      spawnTick: this.tick,
      expiresAtTick: this.tick + ttlTicks,
    });
  }

  private tryPlaceMine(tank: TankState, brain: TankBrain): void {
    if (this.tick - brain.lastMineTick < MINE_COOLDOWN_TICKS) return;
    if (tank.ammo.mines <= 0 || tank.fuel < FUEL_MINE) return;
    brain.lastMineTick = this.tick;
    tank.ammo.mines--;
    tank.fuel -= FUEL_MINE;
    this.mines.push({
      id: `m${this.nextId++}`,
      ownerId: tank.id,
      ownerTeam: tank.team,
      x: tank.x,
      y: tank.y,
      spawnTick: this.tick,
    });
  }

  private useItem(tank: TankState, brain: TankBrain, item: ItemType): void {
    switch (item) {
      case ItemType.SHIELD:
        if (tank.ammo.shields > 0 && !tank.hasShield) {
          tank.ammo.shields--;
          tank.hasShield = true;
          brain.shieldUntilTick = this.tick + SERVER_TICK_RATE * 5;
        }
        break;
      case ItemType.RADAR:
        // Radar is part of the fuel economy: it costs both a charge and fuel.
        if (tank.ammo.radar > 0 && tank.fuel >= FUEL_RADAR_SCAN) {
          tank.ammo.radar--;
          tank.fuel -= FUEL_RADAR_SCAN;
          brain.radarUntilTick = this.tick + RADAR_DETECT_TICKS;
          this.events.push({ tick: this.tick, kind: "radar_scan", subjectId: tank.id });
        }
        break;
      case ItemType.TELEPORT_CHARGE:
        if (brain.moveTarget) this.tryTeleport(tank, brain, brain.moveTarget.x, brain.moveTarget.y);
        break;
      case ItemType.MISSILE:
        this.tryFireMissile(tank, brain, brain.aim);
        break;
      case ItemType.MINE_PACK:
        this.tryPlaceMine(tank, brain);
        break;
      default:
        break;
    }
  }

  private tryTeleport(tank: TankState, brain: TankBrain, x: number, y: number): void {
    if (tank.ammo.teleports <= 0 || tank.fuel < FUEL_TELEPORT) return;
    const dx = x - tank.x;
    const dy = y - tank.y;
    const dist = Math.hypot(dx, dy) || 1;
    const range = Math.min(dist, TELEPORT_MAX_RANGE);
    tank.ammo.teleports--;
    tank.fuel -= FUEL_TELEPORT;
    tank.x = clamp(tank.x + (dx / dist) * range, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS);
    tank.y = clamp(tank.y + (dy / dist) * range, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS);
    brain.moveTarget = null;
  }

  /**
   * Drop a fuel canister a short distance ahead of the tank, spending that
   * fuel. Offsetting past the pickup-collision radius means the crate forms a
   * real cache you can leave and return to, instead of being re-collected on
   * the same tick.
   */
  private depositFuel(tank: TankState, amount: number): void {
    const reserve = 50; // never strand yourself with a deposit
    if (tank.fuel - reserve < amount) return;
    tank.fuel -= amount;
    // Place it behind the hull (opposite the facing) just outside pickup range.
    const drop = TANK_RADIUS + PICKUP_RADIUS + 12;
    const dropX = clamp(tank.x - Math.cos(tank.angle) * drop, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS);
    const dropY = clamp(
      tank.y - Math.sin(tank.angle) * drop,
      TANK_RADIUS,
      MAP_HEIGHT - TANK_RADIUS,
    );
    this.pickups.push({
      id: `k${this.nextId++}`,
      type: ItemType.FUEL_CRATE,
      x: dropX,
      y: dropY,
    });
  }

  /** Destroyed tanks scatter salvage: a fuel crate plus a piece of equipment. */
  private dropSalvage(x: number, y: number): void {
    const equip = [
      ItemType.MISSILE,
      ItemType.MINE_PACK,
      ItemType.SHIELD,
      ItemType.RADAR,
      ItemType.TELEPORT_CHARGE,
    ];
    const drops: ItemType[] = [
      ItemType.FUEL_CRATE,
      equip[Math.floor(Math.random() * equip.length)]!,
    ];
    for (const type of drops) {
      this.pickups.push({
        id: `k${this.nextId++}`,
        type,
        x: clamp(x + (Math.random() - 0.5) * 48, TANK_RADIUS, MAP_WIDTH - TANK_RADIUS),
        y: clamp(y + (Math.random() - 0.5) * 48, TANK_RADIUS, MAP_HEIGHT - TANK_RADIUS),
      });
    }
  }

  // ---------- damage / lifecycle ----------

  private damageTank(tank: TankState, amount: number, attackerId: string): void {
    if (tank.isSpawnProtected) return;
    if (tank.hasShield) {
      tank.hasShield = false; // shield absorbs one hit
      return;
    }
    // Degrade armour for visual feedback, then drain fuel-as-health.
    tank.armor.front = Math.max(0, tank.armor.front - amount / 6);
    tank.fuel -= amount;
    if (tank.fuel <= 0) this.killTank(tank, attackerId);
  }

  private killTank(tank: TankState, attackerId: string | null): void {
    if (tank.isDead) return;
    tank.isDead = true;
    tank.fuel = 0;
    tank.hasShield = false;
    tank.respawnAtTick = this.tick + RESPAWN_DELAY_TICKS;
    this.events.push({ tick: this.tick, kind: "death", subjectId: tank.id });
    this.dropSalvage(tank.x, tank.y);
    if (attackerId) {
      const killer = this.brains.get(attackerId);
      const killerTank = this.tanks.find((t) => t.id === attackerId);
      if (killer) {
        killer.kills++;
        killer.xp += XP_PER_KILL;
        if (killerTank) {
          killerTank.kills = killer.kills;
          const promoted = rankForXp(killer.xp);
          if (promoted !== killerTank.rank) {
            killerTank.rank = promoted;
            this.events.push({ tick: this.tick, kind: "rank_up", subjectId: killerTank.id });
          }
        }
      }
      this.events.push({ tick: this.tick, kind: "kill", subjectId: attackerId, objectId: tank.id });
    }
  }

  private respawn(tank: TankState): void {
    tank.isDead = false;
    tank.x = TANK_RADIUS + Math.random() * (MAP_WIDTH - TANK_RADIUS * 2);
    tank.y = TANK_RADIUS + Math.random() * (MAP_HEIGHT - TANK_RADIUS * 2);
    tank.fuel = MAX_FUEL;
    tank.hasShield = false;
    tank.armor = { front: 100, side: 100, rear: 100 };
    tank.ammo = {
      missiles: INITIAL_MISSILES,
      mines: INITIAL_MINES,
      teleports: INITIAL_TELEPORTS,
      shields: INITIAL_SHIELDS,
      radar: INITIAL_RADAR,
    };
    tank.isSpawnProtected = true;
    tank.spawnProtectedUntilTick = this.tick + SPAWN_PROTECTION_TICKS;
    const brain = this.brains.get(tank.id);
    if (brain) brain.moveTarget = null;
    this.events.push({ tick: this.tick, kind: "respawn", subjectId: tank.id });
  }

  // ---------- pickups ----------

  private spawnPickup(): void {
    const types = [
      ItemType.FUEL_CRATE,
      ItemType.FUEL_CRATE,
      ItemType.MISSILE,
      ItemType.MINE_PACK,
      ItemType.SHIELD,
      ItemType.RADAR,
      ItemType.TELEPORT_CHARGE,
    ];
    const type = types[Math.floor(Math.random() * types.length)]!;
    this.pickups.push({
      id: `k${this.nextId++}`,
      type,
      x: TANK_RADIUS + Math.random() * (MAP_WIDTH - TANK_RADIUS * 2),
      y: TANK_RADIUS + Math.random() * (MAP_HEIGHT - TANK_RADIUS * 2),
    });
  }

  private applyPickup(tank: TankState, pk: PickupState): void {
    switch (pk.type) {
      case ItemType.FUEL_CRATE:
        tank.fuel = Math.min(MAX_FUEL, tank.fuel + 350);
        break;
      case ItemType.MISSILE:
        tank.ammo.missiles += 3;
        break;
      case ItemType.MINE_PACK:
        tank.ammo.mines += 2;
        break;
      case ItemType.SHIELD:
        tank.ammo.shields += 1;
        break;
      case ItemType.RADAR:
        tank.ammo.radar += 2;
        break;
      case ItemType.TELEPORT_CHARGE:
        tank.ammo.teleports += 1;
        break;
      default:
        break;
    }
  }

  // ---------- helpers ----------

  private nearestEnemy(self: TankState): TankState | null {
    let best: TankState | null = null;
    let bestDist = Infinity;
    for (const other of this.tanks) {
      if (other.id === self.id || other.isDead || other.team === self.team) continue;
      const d = Math.hypot(other.x - self.x, other.y - self.y);
      if (d < bestDist) {
        bestDist = d;
        best = other;
      }
    }
    return best;
  }

  private sameTeam(aId: string, bId: string): boolean {
    const a = this.tanks.find((t) => t.id === aId);
    const b = this.tanks.find((t) => t.id === bId);
    return !!a && !!b && a.team === b.team;
  }

  private emitSnapshot(): void {
    const player = this.tanks.find((t) => t.id === this.playerId);
    const playerBrain = this.brains.get(this.playerId);
    const radarActive = !!playerBrain && this.tick < playerBrain.radarUntilTick;

    // Mask mines: the player only sees their own / ally mines unless radar is up.
    const visibleMines = this.mines.filter(
      (m) => radarActive || !player || m.ownerTeam === player.team,
    );

    const snapshot: GameStateSnapshot = {
      tick: this.tick,
      timestamp: Date.now(),
      tanks: this.tanks,
      projectiles: this.projectiles,
      pickups: this.pickups,
      visibleMines,
      events: this.events,
    };
    this.onMessage({ type: ServerMessageType.SNAPSHOT, snapshot });
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Highest rank whose XP threshold the given total meets. */
function rankForXp(xp: number): MilitaryRank {
  let rank = RANK_ORDER[0]!;
  for (const r of RANK_ORDER) {
    if (xp >= RANK_XP_THRESHOLDS[r]) rank = r;
    else break;
  }
  return rank;
}
