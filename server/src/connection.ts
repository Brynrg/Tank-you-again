import type { WebSocket } from "ws";
import type { ServerMessage, TeamColor } from "@shared/types";

/**
 * Per-WebSocket connection wrapper. Lives for the lifetime of a single
 * authenticated client. `playerId` and `tankId` are populated by `handleAuth`.
 */
export interface Connection {
  /** crypto.randomUUID() — stable for the WS lifetime. */
  id: string;
  socket: WebSocket;
  /** User.id once AUTH succeeds. Empty string before. */
  playerId: string;
  /** Tank.id assigned at addConnection. Empty string before. */
  tankId: string;
  name: string;
  team: TeamColor;
  /** Tick of the last received INPUT, for clock drift / rate-limit checks. */
  lastInputTick: number;
  /** Server tick the last CHAT was emitted on. */
  lastChatTick: number;
  /** Tick the last bullet was fired on. */
  lastBulletTick: number;
  /** Tick the last missile was fired on. */
  lastMissileTick: number;
  /** Tick the last mine was placed on. */
  lastMineTick: number;
}

/** JSON-encode and send a server message if the socket is open. */
export function send(conn: Connection, msg: ServerMessage): void {
  const sock = conn.socket as unknown as {
    readyState: number;
    OPEN: number;
    send: (s: string) => void;
  };
  if (sock.readyState === sock.OPEN) {
    sock.send(JSON.stringify(msg));
  }
}
