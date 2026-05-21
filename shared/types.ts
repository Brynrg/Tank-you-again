// Shared types & enums used by both the authoritative server and the canvas client.
// Network protocol structs live here so they stay in sync.

// ---------- Enums ----------

export enum TeamColor {
  RED = "RED",
  BLUE = "BLUE",
  ORANGE = "ORANGE",
  PURPLE = "PURPLE",
}

export enum MilitaryRank {
  RECRUIT = "RECRUIT",
  PRIVATE = "PRIVATE",
  CORPORAL = "CORPORAL",
  SERGEANT = "SERGEANT",
  LIEUTENANT = "LIEUTENANT",
  CAPTAIN = "CAPTAIN",
  MAJOR = "MAJOR",
  COLONEL = "COLONEL",
  GENERAL = "GENERAL",
  COMMANDER = "COMMANDER",
}

export enum ItemType {
  FUEL_CRATE = "FUEL_CRATE",
  SHIELD = "SHIELD",
  MISSILE = "MISSILE",
  MINE_PACK = "MINE_PACK",
  TELEPORT_CHARGE = "TELEPORT_CHARGE",
}

export enum ProjectileKind {
  BULLET = "BULLET",
  MISSILE = "MISSILE",
}

// ---------- Core game-state structs ----------

export interface AmmoCounts {
  missiles: number;
  mines: number;
  teleports: number;
}

export interface TankState {
  id: string;
  name: string;
  team: TeamColor;
  rank: MilitaryRank;
  x: number;
  y: number;
  /** Hull rotation in radians. */
  angle: number;
  /** Turret rotation in radians, independent of hull. */
  turretAngle: number;
  /** 0..MAX_FUEL — drops with movement, firing, item use. */
  fuel: number;
  hasShield: boolean;
  ammo: AmmoCounts;
  /** True while the tank is invulnerable after spawn. Server-controlled. */
  isSpawnProtected: boolean;
  /** Server tick at which spawn protection expires. */
  spawnProtectedUntilTick: number;
  /** True while the tank is dead / awaiting respawn. */
  isDead: boolean;
  /** Tick at which a dead tank will respawn. */
  respawnAtTick: number;
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  spawnTick: number;
  /** Tick this projectile expires if it hasn't hit anything. */
  expiresAtTick: number;
}

export interface MineState {
  id: string;
  ownerId: string;
  ownerTeam: TeamColor;
  x: number;
  y: number;
  spawnTick: number;
}

export interface PickupState {
  id: string;
  type: ItemType;
  x: number;
  y: number;
}

/** Lightweight event delivered to clients (kill feed, pickups, mine boom, etc.). */
export interface GameEvent {
  /** Tick the event was emitted on. */
  tick: number;
  kind:
    | "kill"
    | "death"
    | "respawn"
    | "pickup"
    | "mine_detonate"
    | "rank_up"
    | "chat"
    | "spawn_protected_end";
  /** Subject (the actor or victim depending on kind). */
  subjectId?: string;
  /** Object (the other party for kill/death). */
  objectId?: string;
  /** Free-form payload — small strings for chat, item type for pickups, etc. */
  payload?: string;
}

/**
 * A single tick of authoritative world state. Mines are filtered server-side
 * to only those visible to the recipient (their own, allies', or detected via radar).
 */
export interface GameStateSnapshot {
  tick: number;
  /** ms since epoch when the server stamped this frame. */
  timestamp: number;
  tanks: TankState[];
  projectiles: ProjectileState[];
  pickups: PickupState[];
  /** Subset of mines this client is allowed to see. Other mines are hidden. */
  visibleMines: MineState[];
  /** Events emitted on this tick (kill feed, etc.). */
  events: GameEvent[];
}

// ---------- Network protocol (top-level message shapes) ----------

export enum ClientMessageType {
  AUTH = "AUTH",
  INPUT = "INPUT",
  MOVE_TO = "MOVE_TO",
  STOP = "STOP",
  USE_ITEM = "USE_ITEM",
  FIRE = "FIRE",
  PLACE_MINE = "PLACE_MINE",
  TELEPORT = "TELEPORT",
  CHAT = "CHAT",
  PING = "PING",
}

export enum ServerMessageType {
  WELCOME = "WELCOME",
  SNAPSHOT = "SNAPSHOT",
  EVENT = "EVENT",
  ERROR = "ERROR",
  PONG = "PONG",
}

export interface ClientAuthMessage {
  type: ClientMessageType.AUTH;
  /** Either an account session token, or a guest display name. */
  token?: string;
  guestName?: string;
  /** Optional preferred team — server may reassign for balance. */
  preferredTeam?: TeamColor;
}

/** 8-way intent. Diagonals are encoded by setting two axes. */
export interface ClientInputMessage {
  type: ClientMessageType.INPUT;
  /** Tick the client believes is current — server clamps. */
  clientTick: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Aim angle in radians, world-space. */
  aim: number;
}

export interface ClientFireMessage {
  type: ClientMessageType.FIRE;
  weapon: ProjectileKind;
  /** Aim angle in radians, world-space. Server snaps to the latest input.aim if absent. */
  aim?: number;
}

export interface ClientMoveToMessage {
  type: ClientMessageType.MOVE_TO;
  /** Tick the client believes is current. Server uses this only for stale-command checks. */
  clientTick: number;
  /** Target world coordinates. Server clamps to map bounds. */
  x: number;
  y: number;
}

export interface ClientStopMessage {
  type: ClientMessageType.STOP;
  /** Tick the client believes is current. Server uses this only for stale-command checks. */
  clientTick: number;
}

export interface ClientPlaceMineMessage {
  type: ClientMessageType.PLACE_MINE;
}

export interface ClientUseItemMessage {
  type: ClientMessageType.USE_ITEM;
  item: ItemType;
}

export interface ClientTeleportMessage {
  type: ClientMessageType.TELEPORT;
  /** Target world coordinates. Server validates range. */
  x: number;
  y: number;
}

export interface ClientChatMessage {
  type: ClientMessageType.CHAT;
  text: string;
}

export interface ClientPingMessage {
  type: ClientMessageType.PING;
  /** Echoed back as PONG.token so the client can compute RTT. */
  token: number;
}

export interface ServerWelcomeMessage {
  type: ServerMessageType.WELCOME;
  yourTankId: string;
  yourTeam: TeamColor;
  serverTickRate: number;
  mapWidth: number;
  mapHeight: number;
}

export interface ServerSnapshotMessage {
  type: ServerMessageType.SNAPSHOT;
  snapshot: GameStateSnapshot;
}

export interface ServerEventMessage {
  type: ServerMessageType.EVENT;
  event: GameEvent;
}

export interface ServerErrorMessage {
  type: ServerMessageType.ERROR;
  reason: string;
}

export interface ServerPongMessage {
  type: ServerMessageType.PONG;
  token: number;
  /** Server tick at the moment the pong was emitted. */
  serverTick: number;
}

export type ClientMessage =
  | ClientAuthMessage
  | ClientInputMessage
  | ClientMoveToMessage
  | ClientStopMessage
  | ClientFireMessage
  | ClientPlaceMineMessage
  | ClientUseItemMessage
  | ClientTeleportMessage
  | ClientChatMessage
  | ClientPingMessage;

export type ServerMessage =
  | ServerWelcomeMessage
  | ServerSnapshotMessage
  | ServerEventMessage
  | ServerErrorMessage
  | ServerPongMessage;

// ---------- Tunables (single source of truth for server and client UI) ----------

export const SERVER_TICK_RATE = 20; // Hz
export const TICK_MS = 1000 / SERVER_TICK_RATE; // 50 ms
export const MAP_WIDTH = 2048;
export const MAP_HEIGHT = 2048;

// Tank
export const TANK_RADIUS = 18;
export const TANK_SPEED = 120; // world-units / sec
export const COMMAND_ARRIVAL_RADIUS = 8;
export const MAX_FUEL = 1000;
export const FUEL_MOVE_PER_SEC = 8; // drain while moving
export const SPAWN_PROTECTION_MS = 4000;
export const SPAWN_PROTECTION_TICKS = Math.round((SPAWN_PROTECTION_MS / 1000) * SERVER_TICK_RATE);
export const RESPAWN_DELAY_TICKS = 3 * SERVER_TICK_RATE; // 3 seconds
export const SPAWN_FUEL = MAX_FUEL;

// Ammo (initial loadout)
export const INITIAL_MISSILES = 5;
export const INITIAL_MINES = 5;
export const INITIAL_TELEPORTS = 1;

// Weapons
export const FUEL_FIRE_BULLET = 5;
export const FUEL_FIRE_MISSILE = 25;
export const FUEL_MINE = 40;
export const FUEL_SHIELD_PER_SEC = 30;
export const FUEL_TELEPORT = 80;

export const BULLET_SPEED = 600; // world-units / sec
export const BULLET_DAMAGE = 60;
export const BULLET_TTL_TICKS = SERVER_TICK_RATE * 2; // 2 sec
export const BULLET_RADIUS = 3;
export const BULLET_COOLDOWN_TICKS = 5; // 0.25 sec between shots

export const MISSILE_SPEED = 380;
export const MISSILE_DAMAGE = 240;
export const MISSILE_TTL_TICKS = SERVER_TICK_RATE * 4;
export const MISSILE_RADIUS = 6;
export const MISSILE_COOLDOWN_TICKS = 18; // 0.9 sec between shots

// Mines / radar
export const MINE_RADIUS = 24;
export const MINE_DAMAGE = 250;
export const RADAR_DETECT_TICKS = 60; // 3 sec at 20 Hz
export const RADAR_RADIUS = 320; // viewer-tank-to-mine vision radius
export const VISION_RADIUS = 700; // viewer-tank-to-tank/projectile vision radius
export const MINE_COOLDOWN_TICKS = 20;

// Teleport
export const TELEPORT_MAX_RANGE = 400;

// Pickups
export const PICKUP_RADIUS = 18;
export const PICKUP_SPAWN_INTERVAL_TICKS = SERVER_TICK_RATE * 12; // 12 sec
export const PICKUP_MAX_ACTIVE = 18;
export const FUEL_CRATE_RESTORE = 350;
export const MISSILE_PICKUP_AMOUNT = 3;
export const MINE_PICKUP_AMOUNT = 2;
export const TELEPORT_PICKUP_AMOUNT = 1;

// Rank ladder (XP gates)
export const RANK_XP_THRESHOLDS: Record<MilitaryRank, number> = {
  [MilitaryRank.RECRUIT]: 0,
  [MilitaryRank.PRIVATE]: 100,
  [MilitaryRank.CORPORAL]: 300,
  [MilitaryRank.SERGEANT]: 700,
  [MilitaryRank.LIEUTENANT]: 1500,
  [MilitaryRank.CAPTAIN]: 3000,
  [MilitaryRank.MAJOR]: 6000,
  [MilitaryRank.COLONEL]: 12000,
  [MilitaryRank.GENERAL]: 24000,
  [MilitaryRank.COMMANDER]: 50000,
};

export const RANK_ORDER: MilitaryRank[] = [
  MilitaryRank.RECRUIT,
  MilitaryRank.PRIVATE,
  MilitaryRank.CORPORAL,
  MilitaryRank.SERGEANT,
  MilitaryRank.LIEUTENANT,
  MilitaryRank.CAPTAIN,
  MilitaryRank.MAJOR,
  MilitaryRank.COLONEL,
  MilitaryRank.GENERAL,
  MilitaryRank.COMMANDER,
];

// XP rewards / losses
export const XP_PER_KILL = 25;
export const XP_PER_ASSIST = 10;
export const XP_PER_DEATH = -15;

// Anti-cheat rate limits
export const MAX_INPUT_HZ = 60;
export const MAX_CHAT_PER_SEC = 1;
