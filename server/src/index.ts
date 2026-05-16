import "dotenv/config";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { PrismaClient } from "@prisma/client";
import { SERVER_TICK_RATE, ServerMessageType, type ServerWelcomeMessage } from "@shared/types";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

await app.register(websocket);

app.get("/health", async () => ({ status: "ok", tickRate: SERVER_TICK_RATE }));

// @fastify/websocket v11 requires WS routes to be registered inside a plugin
// scope — outside one, the upgrade middleware never wires in and the route
// behaves as a regular HTTP handler (which 500s on `socket.send`).
await app.register(async (scope) => {
  scope.get("/ws", { websocket: true }, (socket, req) => {
    app.log.info({ remote: req.ip }, "ws client connected");

    const welcome: ServerWelcomeMessage = {
      type: ServerMessageType.WELCOME,
      yourTankId: "pending",
      serverTickRate: SERVER_TICK_RATE,
      mapWidth: 0,
      mapHeight: 0,
    };
    socket.send(JSON.stringify(welcome));

    socket.on("message", (raw: Buffer) => {
      // Phase-1 stub: echo received frames so the client can verify the pipe.
      socket.send(raw.toString());
    });

    socket.on("close", () => {
      app.log.info("ws client disconnected");
    });
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
