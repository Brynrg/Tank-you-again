// Phase-1 engine boot: grabs the canvas, draws a placeholder frame, and opens
// a WS connection to the authoritative server. Real game loop replaces draw()
// once the snapshot pipeline lands.

import { SERVER_TICK_RATE, ServerMessageType, type ServerMessage } from "@shared/types";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) throw new Error("#game canvas not found");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D context unavailable");

let lastServerTick = 0;
let connectionStatus: "connecting" | "open" | "closed" = "connecting";

function draw(): void {
  if (!ctx || !canvas) return;
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#facc15";
  ctx.font = "bold 32px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Tank You Again", canvas.width / 2, canvas.height / 2 - 20);

  ctx.fillStyle = "#facc1599";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("Phase 1 — engine bootstrap", canvas.width / 2, canvas.height / 2 + 10);
  ctx.fillText(
    `server tickRate=${SERVER_TICK_RATE}Hz · ws=${connectionStatus} · lastTick=${lastServerTick}`,
    canvas.width / 2,
    canvas.height / 2 + 36,
  );
}

function connect(): void {
  const wsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? "ws://localhost:3001/ws";
  const ws = new WebSocket(wsUrl);

  ws.addEventListener("open", () => {
    connectionStatus = "open";
    draw();
  });

  ws.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      if (msg.type === ServerMessageType.WELCOME) {
        console.info("[client] welcome", msg);
      } else if (msg.type === ServerMessageType.SNAPSHOT) {
        lastServerTick = msg.snapshot.tick;
      }
    } catch {
      // ignore non-JSON echoes during phase-1 stub
    }
    draw();
  });

  ws.addEventListener("close", () => {
    connectionStatus = "closed";
    draw();
  });
}

draw();
connect();
