import {
  ServerMessageType,
  type GameStateSnapshot,
  type ServerMessage,
  type TankState,
} from "@shared/types";

import { attach as attachInput, type InputLayer } from "./input.js";
import { NetClient, type NetStatus } from "./net.js";
import { followTank, makeCamera, renderFrame, renderHud, type Camera } from "./render.js";

export interface RunOptions {
  canvas: HTMLCanvasElement;
  wsUrl: string;
  guestName: string;
}

export interface RunHandle {
  stop(): void;
  getStatus(): NetStatus;
}

/**
 * Boot the game: open a WebSocket via `NetClient`, wire input listeners,
 * start a rAF loop that ships INPUT/FIRE/MINE intents at ~60Hz and renders
 * the latest snapshot.
 */
export function run(opts: RunOptions): RunHandle {
  const maybeCtx = opts.canvas.getContext("2d");
  if (!maybeCtx) throw new Error("2D context unavailable");
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const camera: Camera = makeCamera();
  const input: InputLayer = attachInput(opts.canvas, camera);

  let yourTankId = "";
  let lastSnapshot: GameStateSnapshot | null = null;
  let yourTank: TankState | null = null;
  let status: NetStatus = "connecting";
  let clientTick = 0;
  let lastFrameMs = performance.now();

  const net = new NetClient({
    url: opts.wsUrl,
    guestName: opts.guestName,
    onMessage: (msg: ServerMessage) => {
      if (msg.type === ServerMessageType.WELCOME) {
        yourTankId = msg.yourTankId;
      } else if (msg.type === ServerMessageType.SNAPSHOT) {
        lastSnapshot = msg.snapshot;
        yourTank = lastSnapshot.tanks.find((t) => t.id === yourTankId) ?? null;
      } else if (msg.type === ServerMessageType.EVENT) {
        // Inline event handling could trigger sound/particles. Stubbed for now.
      }
    },
    onStatus: (s) => {
      status = s;
    },
  });

  let rafHandle: number = 0;
  function frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrameMs) / 1000);
    lastFrameMs = now;
    clientTick += 1;

    // Send input + queued one-shots
    net.send(input.currentInput(clientTick));
    for (const fire of input.consumeFireQueue()) net.send(fire);
    for (const mine of input.consumeMineQueue()) net.send(mine);
    for (const use of input.consumeUseItemQueue()) net.send(use);

    // Camera follow
    followTank(camera, yourTank, dt);

    // Render
    if (lastSnapshot) {
      renderFrame(ctx, lastSnapshot, camera, yourTankId);
    } else {
      ctx.fillStyle = "#0b0b14";
      ctx.fillRect(0, 0, opts.canvas.width, opts.canvas.height);
      ctx.fillStyle = "#facc15";
      ctx.font = "16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Connecting…", opts.canvas.width / 2, opts.canvas.height / 2);
    }
    renderHud(ctx, {
      yourTank,
      snap: lastSnapshot,
      rttMs: net.getRttMs(),
      status,
      serverTick: net.getServerTick(),
    });

    rafHandle = requestAnimationFrame(frame);
  }
  rafHandle = requestAnimationFrame(frame);

  return {
    stop() {
      cancelAnimationFrame(rafHandle);
      input.detach();
      net.destroy();
    },
    getStatus: () => status,
  };
}
