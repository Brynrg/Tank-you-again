// Shared types & enums used by both the authoritative server and the canvas client.
// Network protocol structs go here so they stay in sync.

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
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spawnTick: number;
}

export interface MineState {
  id: string;
  ownerId: string;
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
}

// ---------- Network protocol (top-level message shapes) ----------

export enum ClientMessageType {
  AUTH = "AUTH",
  INPUT = "INPUT",
  USE_ITEM = "USE_ITEM",
  FIRE = "FIRE",
  PLACE_MINE = "PLACE_MINE",
  TELEPORT = "TELEPORT",
  CHAT = "CHAT",
}

export enum ServerMessageType {
  WELCOME = "WELCOME",
  SNAPSHOT = "SNAPSHOT",
  EVENT = "EVENT",
  ERROR = "ERROR",
}

export interface ClientAuthMessage {
  type: ClientMessageType.AUTH;
  /** Either an account session token, or a guest display name. */
  token?: string;
  guestName?: string;
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

export interface ServerWelcomeMessage {
  type: ServerMessageType.WELCOME;
  yourTankId: string;
  serverTickRate: number;
  mapWidth: number;
  mapHeight: number;
}

export interface ServerSnapshotMessage {
  type: ServerMessageType.SNAPSHOT;
  snapshot: GameStateSnapshot;
}

export type ClientMessage =
  | ClientAuthMessage
  | ClientInputMessage;

export type ServerMessage =
  | ServerWelcomeMessage
  | ServerSnapshotMessage;

// ---------- Tunables (single source of truth for server and client UI) ----------

export const SERVER_TICK_RATE = 20; // Hz
export const MAP_WIDTH = 2048;
export const MAP_HEIGHT = 2048;
export const MAX_FUEL = 1000;
export const SPAWN_PROTECTION_MS = 4000;
