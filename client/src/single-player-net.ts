import {
  ClientMessageType,
  MAP_HEIGHT,
  MAP_WIDTH,
  ProjectileKind,
  SERVER_TICK_RATE,
  ServerMessageType,
  TeamColor,
  TICK_MS,
  type ClientMessage,
  type GameStateSnapshot,
  type ServerMessage,
} from "@shared/types";

import { Arena } from "@shared/sim/arena.js";
import { SurvivalDirector } from "@shared/sim/survival.js";

import type { GameMode } from "./auth-screen.js";

export type NetStatus = "connected" | "connecting" | "closed";

/**
 * Single-player client. Implements the same observable contract as the
 * multiplayer {@link NetClient} (callers `send()` intents and receive
 * authoritative `SNAPSHOT` messages via `onMessage`), but the authority is a
 * local {@link Arena} — the SAME simulation + computer-player AI the server
 * runs. The two no longer drift apart: this file is just glue (a local tick
 * timer + message mapping), all rules live in `shared/sim`.
 */
export class SinglePlayerNetClient {
  private readonly status: NetStatus = "connected";
  private readonly onMessage: (msg: ServerMessage) => void;
  private readonly onStatus?: (status: NetStatus) => void;

  private readonly arena: Arena;
  private readonly playerId: string;
  private readonly survival: SurvivalDirector | null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: {
    onMessage: (msg: ServerMessage) => void;
    onStatus?: (status: NetStatus) => void;
    mode?: GameMode;
  }) {
    this.onMessage = options.onMessage;
    this.onStatus = options.onStatus;
    const mode: GameMode = options.mode ?? "skirmish";

    if (mode === "survival") {
      // One life vs waves of RED tanks. A single bot team means the wave hunts
      // you, not each other; the director owns spawning and wreck removal, so
      // no population top-up and no auto-respawn.
      this.arena = new Arena({
        aiTargetCount: 0,
        autoRespawn: false,
        botTeams: [TeamColor.RED],
        trackXp: true,
      });
    } else {
      // Skirmish: one human (BLUE, centre spawn) against a spread of bots that
      // own the other three teams, so it stays "you vs everyone".
      this.arena = new Arena({
        aiTargetCount: 9,
        botTeams: [TeamColor.RED, TeamColor.ORANGE, TeamColor.PURPLE],
        trackXp: true,
      });
    }
    const player = this.arena.addPlayer({
      name: "You",
      team: TeamColor.BLUE,
      spawn: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
    });
    this.playerId = player.id;
    this.survival = mode === "survival" ? new SurvivalDirector(this.arena, this.playerId) : null;
    this.arena.seedPickups(mode === "survival" ? 10 : 18);

    // The local engine is authoritative and always available.
    this.onStatus?.(this.status);
    this.onMessage({
      type: ServerMessageType.WELCOME,
      yourTankId: this.playerId,
      yourTeam: TeamColor.BLUE,
      serverTickRate: SERVER_TICK_RATE,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
    });
    this.emitSnapshot();

    this.timer = setInterval(() => {
      this.arena.step();
      this.survival?.tick();
      this.emitSnapshot();
    }, TICK_MS);
  }

  /** Fold a client intent into the local player's tank. */
  send(msg: ClientMessage): void {
    switch (msg.type) {
      case ClientMessageType.INPUT:
        this.arena.setInput(this.playerId, {
          up: msg.up,
          down: msg.down,
          left: msg.left,
          right: msg.right,
          aim: msg.aim,
          clientTick: msg.clientTick,
        });
        break;
      case ClientMessageType.MOVE_TO:
        this.arena.setMoveTo(this.playerId, msg.x, msg.y, msg.clientTick);
        break;
      case ClientMessageType.STOP:
        this.arena.setStop(this.playerId, msg.clientTick);
        break;
      case ClientMessageType.FIRE:
        this.arena.fire(this.playerId, msg.weapon ?? ProjectileKind.BULLET, msg.aim);
        break;
      case ClientMessageType.PLACE_MINE:
        this.arena.placeMine(this.playerId);
        break;
      case ClientMessageType.USE_ITEM:
        this.arena.useItem(this.playerId, msg.item);
        break;
      case ClientMessageType.TELEPORT:
        this.arena.teleport(this.playerId, msg.x, msg.y);
        break;
      case ClientMessageType.DEPOSIT_FUEL:
        this.arena.depositFuel(this.playerId, msg.amount);
        break;
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
    return this.arena.tickIndex;
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Build a player-POV snapshot and deliver it like a server would. Vision is
   *  left unmasked for full single-player situational awareness; enemy mines are
   *  still masked (radar/ally only) by the arena. */
  private emitSnapshot(): void {
    const events = this.arena.drainEvents();
    const snapshot: GameStateSnapshot = this.arena.snapshotFor(this.playerId, false);
    snapshot.timestamp = Date.now();
    snapshot.events = events;
    if (this.survival) snapshot.survival = this.survival.hudState();
    this.onMessage({ type: ServerMessageType.SNAPSHOT, snapshot });
  }
}
