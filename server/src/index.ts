import "dotenv/config";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { PrismaClient } from "@prisma/client";
import { SERVER_TICK_RATE, ServerMessageType, type ServerWelcomeMessage } from "@shared/types";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

await app.register(websocket);

app.get("/health", async () => ({ status: "ok", tickRate: SERVER_TICK_RATE }));

// Single WebSocket endpoint. The room/loop manager will live in its own module
// once gameplay starts going in — keeping this file as the boot stub for Phase 1.
app.get("/ws", { websocket: true }, (socket /* WebSocket */, req) => {
  app.log.info({ remote: req.ip }, "ws client connected");

  const welcome: ServerWelcomeMessage = {
    type: ServerMessageType.WELCOME,
    yourTankId: "pending",
    serverTickRate: SERVER_TICK_RATE,
    mapWidth: 0,
    mapHeight: 0,
  };
  socket.send(JSON.stringify(welcome));

  socket.on("message", (raw) => {
    // Phase-1 stub: echo received frames so the client can verify the pipe.
    socket.send(raw.toString());
  });

  socket.on("close", () => {
    app.log.info("ws client disconnected");
  });
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
try {
  await app.listen({ port, host });
  app.log.info(`tank server listening on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}
