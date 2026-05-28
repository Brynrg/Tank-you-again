import "dotenv/config";

import { randomUUID } from "node:crypto";

import websocket from "@fastify/websocket";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";

import {
  ClientMessageType,
  MAP_HEIGHT,
  MAP_WIDTH,
  MilitaryRank,
  RANK_ORDER,
  SERVER_TICK_RATE,
  ServerMessageType,
  TeamColor,
  type ClientFireMessage,
  type ClientInputMessage,
  type ClientMessage,
  type ClientMoveToMessage,
  type ClientPingMessage,
  type ClientPlaceMineMessage,
  type ClientStopMessage,
  type ClientTeleportMessage,
  type ClientUseItemMessage,
  type ServerWelcomeMessage,
} from "@shared/types";

import { handleAuth } from "./auth.js";
import { send, type Connection } from "./connection.js";
import { RoomLoop } from "./loop.js";
import { applyXpDelta } from "./sim/rank.js";

const PRISMA_REQUIRED =
  process.env.NODE_ENV !== "test" &&
  process.env.DISABLE_DB !== "1" &&
  typeof process.env.DATABASE_URL === "string" &&
  process.env.DATABASE_URL.length > 0;

const prisma: PrismaClient | null = PRISMA_REQUIRED ? new PrismaClient() : null;

const app = Fastify({ logger: true });

await app.register(websocket);

app.get("/health", async () => ({
  status: "ok",
  tickRate: SERVER_TICK_RATE,
  tickIndex: room.tickIndex,
  connections: connections.size,
}));

// Top-N leaderboard by highestRank then xp.
app.get("/leaderboard", async () => {
  if (!prisma) return { entries: [] };
  const top = await prisma.tank.findMany({
    take: 50,
    orderBy: [{ xp: "desc" }],
  });
  // Re-sort by rank-index desc then xp desc to honor the "highestRank then xp"
  // contract (Prisma can't sort by RANK_ORDER index).
  const rankIdx = (r: string): number => RANK_ORDER.indexOf(r as MilitaryRank);
  const sorted = [...top].sort((a, b) => {
    const ai = rankIdx(a.highestRank);
    const bi = rankIdx(b.highestRank);
    if (ai !== bi) return bi - ai;
    return b.xp - a.xp;
  });
  return {
    entries: sorted.slice(0, 20).map((t) => ({
      name: t.name,
      rank: t.rank,
      highestRank: t.highestRank,
      xp: t.xp,
      kills: t.kills,
      deaths: t.deaths,
    })),
  };
});

const room = new RoomLoop();
const connections = new Map<string, Connection>(); // connId -> Connection

// Persist XP/rank when the room emits an XP delta.
room.onXpDelta = (tankId, delta, reason) => {
  if (!prisma) return;
  void persistXpDelta(prisma, tankId, delta, reason);
};

room.start();

// @fastify/websocket v11 requires WS routes to be registered inside a plugin
// scope. Outside of one, the upgrade middleware never wires and the route
// behaves as a plain HTTP handler.
await app.register(async (scope) => {
  scope.get("/ws", { websocket: true }, (socket, req) => {
    const conn: Connection = {
      id: randomUUID(),
      socket: socket as unknown as Connection["socket"],
      playerId: "",
      tankId: "",
      name: "",
      team: TeamColor.BLUE,
      lastInputTick: 0,
      lastChatTick: -1_000_000,
      lastBulletTick: -1_000_000,
      lastMissileTick: -1_000_000,
      lastMineTick: -1_000_000,
    };
    connections.set(conn.id, conn);
    app.log.info({ remote: req.ip, connId: conn.id }, "ws client connected");

    socket.on("message", (raw: Buffer) => {
      let msg: ClientMessage | null = null;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object" || typeof (msg as { type?: unknown }).type !== "string") {
        return;
      }

      switch (msg.type) {
        case ClientMessageType.AUTH:
          void handleAuthMessage(conn, msg);
          return;
        case ClientMessageType.INPUT:
          if (conn.tankId) room.ingestInput(conn.id, msg as ClientInputMessage);
          return;
        case ClientMessageType.MOVE_TO:
          if (conn.tankId) room.ingestMoveTo(conn.id, msg as ClientMoveToMessage);
          return;
        case ClientMessageType.STOP:
          if (conn.tankId) room.ingestStop(conn.id, msg as ClientStopMessage);
          return;
        case ClientMessageType.FIRE:
          if (conn.tankId) room.handleFire(conn.id, msg as ClientFireMessage);
          return;
        case ClientMessageType.PLACE_MINE:
          if (conn.tankId) room.handlePlaceMine(conn.id, msg as ClientPlaceMineMessage);
          return;
        case ClientMessageType.USE_ITEM:
          if (conn.tankId) room.handleUseItem(conn.id, msg as ClientUseItemMessage);
          return;
        case ClientMessageType.TELEPORT:
          if (conn.tankId) room.handleTeleport(conn.id, msg as ClientTeleportMessage);
          return;
        case ClientMessageType.PING: {
          const ping = msg as ClientPingMessage;
          send(conn, {
            type: ServerMessageType.PONG,
            token: ping.token,
            serverTick: room.tickIndex,
          });
          return;
        }
        case ClientMessageType.CHAT:
          // Chat is wired through events on the snapshot stream; full chat
          // pipe is a P2 follow-up. Drop silently for now.
          return;
        default:
          return;
      }
    });

    socket.on("close", () => {
      room.removeConnection(conn.id);
      connections.delete(conn.id);
      app.log.info({ connId: conn.id }, "ws client disconnected");
    });
  });
});

async function handleAuthMessage(conn: Connection, msg: ClientMessage): Promise<void> {
  if (msg.type !== ClientMessageType.AUTH) return;
  if (conn.tankId) {
    send(conn, { type: ServerMessageType.ERROR, reason: "already authenticated" });
    return;
  }
  // When no DB is configured (local dev without DATABASE_URL), skip persistence
  // and synthesize an in-memory identity so a developer can still play.
  if (!prisma) {
    const guestName = (msg.guestName ?? "").trim() || `Player-${conn.id.slice(0, 4)}`;
    const tankId = randomUUID();
    const tank = room.addConnection({
      conn,
      tankId,
      name: guestName.slice(0, 16),
      rank: MilitaryRank.RECRUIT,
    });
    sendWelcome(conn, tank.id);
    return;
  }

  const r = await handleAuth(prisma, { token: msg.token, guestName: msg.guestName });
  if (!r.ok) {
    send(conn, { type: ServerMessageType.ERROR, reason: r.reason });
    try {
      (conn.socket as unknown as { close: () => void }).close();
    } catch {
      /* ignore */
    }
    return;
  }
  conn.playerId = r.user.id;
  const tank = room.addConnection({
    conn,
    tankId: r.tank.id,
    name: r.tank.name,
    rank: (r.tank.rank as MilitaryRank) ?? MilitaryRank.RECRUIT,
  });
  sendWelcome(conn, tank.id);
}

function sendWelcome(conn: Connection, tankId: string): void {
  const welcome: ServerWelcomeMessage = {
    type: ServerMessageType.WELCOME,
    yourTankId: tankId,
    yourTeam: conn.team,
    serverTickRate: SERVER_TICK_RATE,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
  };
  send(conn, welcome);
}

async function persistXpDelta(
  prismaClient: PrismaClient,
  tankId: string,
  delta: number,
  reason: "kill" | "death" | "assist",
): Promise<void> {
  try {
    const t = await prismaClient.tank.findUnique({ where: { id: tankId } });
    if (!t) return;
    const ranked = {
      rank: t.rank,
      xp: t.xp,
      highestRank: t.highestRank,
    };
    applyXpDelta(ranked, delta);
    await prismaClient.tank.update({
      where: { id: tankId },
      data: {
        rank: ranked.rank,
        xp: ranked.xp,
        highestRank: ranked.highestRank,
        kills: reason === "kill" ? { increment: 1 } : undefined,
        deaths: reason === "death" ? { increment: 1 } : undefined,
      },
    });
  } catch (err) {
    app.log.warn({ err, tankId }, "persistXpDelta failed");
  }
}

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
try {
  await app.listen({ port, host });
  app.log.info(`tank server listening on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  room.stop();
  if (prisma) await prisma.$disconnect();
  process.exit(1);
}

// Graceful shutdown on SIGINT/SIGTERM (Fly.io sends SIGINT on machine stop).
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void (async () => {
      app.log.info({ sig }, "shutting down");
      room.stop();
      try {
        await app.close();
      } catch {
        /* ignore */
      }
      if (prisma) await prisma.$disconnect();
      process.exit(0);
    })();
  });
}

export { RoomLoop } from './loop.js';
