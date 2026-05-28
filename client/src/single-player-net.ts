import { 
  ClientMessageType, 
  ServerMessageType, 
  type ClientMessage, 
  type ServerMessage,
  type GameStateSnapshot,
} from "@shared/types";

export type NetStatus = "connected" | "connecting" | "closed";

/**
 * NetClient for single-player mode that handles local game state
 * instead of WebSocket communication.
 */
export class SinglePlayerNetClient {
  private snapshot: GameStateSnapshot | null = null;
  private status: NetStatus = "connected";
  private onMessage?: (msg: ServerMessage) => void;
  private onStatus?: (status: NetStatus) => void;
  private clientTick = 0;

  constructor(options: { onMessage: (msg: ServerMessage) => void; onStatus?: (status: NetStatus) => void; }) {
    this.onMessage = options.onMessage;
    this.onStatus = options.onStatus;
  }

  /** Send a message to the server - no-op for single-player */
  send(msg: ClientMessage): void {
    // In single-player mode, messages are processed locally
    this.processLocalMessage(msg);
  }

  /** Process local messages */
  private processLocalMessage(msg: ClientMessage): void {
    // For now, just acknowledge messages with an existing type
    const response: ServerMessage = {
      type: ServerMessageType.SNAPSHOT,
      tick: 0,
      snapshot: this.snapshot || {
        tick: 0,
        timestamp: Date.now(),
        tanks: [],
        projectiles: [],
        pickups: [],
        visibleMines: [],
        events: [],
      } as GameStateSnapshot,
    };
    if (this.onMessage) {
      this.onMessage(response);
    }
  }

  /** Set game state snapshot */
  setSnapshot(snapshot: GameStateSnapshot): void {
    this.snapshot = snapshot;
    this.clientTick = snapshot.tick; // Update client tick
    const response: ServerMessage = {
      type: ServerMessageType.SNAPSHOT,
      tick: snapshot.tick,
      snapshot
    };
    if (this.onMessage) {
      this.onMessage(response);
    }
  }

  /** Get current status */
  getStatus(): NetStatus {
    return this.status;
  }

  /** Get round-trip time (always 0 for single-player) */
  getRttMs(): number {
    return 0;
  }

  /** Get server tick (always currentTick for single-player) */
  getServerTick(): number {
    return this.clientTick;
  }

  /** Close connection */
  close(): void {
    this.status = "closed";
    if (this.onStatus) {
      this.onStatus(this.status);
    }
  }
}