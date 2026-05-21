import {
  ClientMessageType,
  ServerMessageType,
  type ClientMessage,
  type ServerMessage,
} from "@shared/types";

export interface NetClientOptions {
  url: string;
  guestName: string;
  /** Called with each parsed ServerMessage on the open socket. */
  onMessage: (msg: ServerMessage) => void;
  /** Called when status changes — useful for HUD. */
  onStatus?: (status: NetStatus) => void;
}

export type NetStatus = "connecting" | "open" | "closed" | "auth-error";

/**
 * Auto-reconnecting WebSocket client. On open:
 *   1. Sends AUTH {guestName}
 *   2. Forwards every subsequent message via onMessage
 *
 * Reconnect: exponential backoff 500ms → 8s, capped, plus a small jitter so
 * many simultaneously-disconnected clients don't dogpile the server.
 *
 * Ping/pong: every 5 seconds we send PING{token=Date.now()}. The server
 * responds with PONG{token, serverTick}; the round-trip time is exposed via
 * `getRttMs()` for the HUD.
 */
export class NetClient {
  private url: string;
  private guestName: string;
  private onMessage: (m: ServerMessage) => void;
  private onStatus: (s: NetStatus) => void;
  private socket: WebSocket | null = null;
  private status: NetStatus = "connecting";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPingSentAt = 0;
  private rttMs = 0;
  private serverTick = 0;
  private destroyed = false;

  constructor(opts: NetClientOptions) {
    this.url = opts.url;
    this.guestName = opts.guestName;
    this.onMessage = opts.onMessage;
    this.onStatus = opts.onStatus ?? (() => {});
    this.connect();
  }

  send(msg: ClientMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  getStatus(): NetStatus {
    return this.status;
  }

  getRttMs(): number {
    return this.rttMs;
  }

  getServerTick(): number {
    return this.serverTick;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    try {
      this.socket?.close();
    } catch {
      /* ignore */
    }
  }

  private setStatus(s: NetStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.onStatus(s);
  }

  private connect(): void {
    if (this.destroyed) return;
    this.setStatus("connecting");

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch (err) {
      console.error("[net] failed to open WebSocket:", err);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.setStatus("open");
      this.send({ type: ClientMessageType.AUTH, guestName: this.guestName });
      this.startPings();
    });

    socket.addEventListener("message", (ev) => {
      let parsed: ServerMessage | null = null;
      try {
        parsed = JSON.parse(typeof ev.data === "string" ? ev.data : "") as ServerMessage;
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      if (parsed.type === ServerMessageType.PONG) {
        if (parsed.token === this.lastPingSentAt) {
          this.rttMs = Date.now() - this.lastPingSentAt;
        }
        this.serverTick = parsed.serverTick;
        return;
      }
      if (parsed.type === ServerMessageType.ERROR) {
        console.warn("[net] server error:", parsed.reason);
        if (parsed.reason.includes("auth") || parsed.reason.includes("username")) {
          this.setStatus("auth-error");
        }
        return;
      }
      this.onMessage(parsed);
    });

    socket.addEventListener("close", () => {
      this.stopPings();
      this.setStatus("closed");
      this.scheduleReconnect();
    });

    socket.addEventListener("error", (err) => {
      console.warn("[net] socket error", err);
    });
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempt += 1;
    const base = Math.min(8000, 500 * 2 ** (this.reconnectAttempt - 1));
    const jitter = Math.floor(Math.random() * 250);
    this.reconnectTimer = setTimeout(() => this.connect(), base + jitter);
  }

  private startPings(): void {
    this.stopPings();
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState !== WebSocket.OPEN) return;
      this.lastPingSentAt = Date.now();
      this.send({ type: ClientMessageType.PING, token: this.lastPingSentAt });
    }, 5000);
  }

  private stopPings(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
