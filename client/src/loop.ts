import {
  COMMAND_ARRIVAL_RADIUS,
  ServerMessageType,
  type GameStateSnapshot,
  type ServerMessage,
  type TankState,
} from "@shared/types";

import { attach as attachInput, type InputLayer } from "./input.js";
import { SnapshotInterpolator } from "./interpolate.js";
import {
  SinglePlayerNetClient,
  type NetStatus as SinglePlayerNetStatus,
} from "./single-player-net.js";
import { NetClient, type NetStatus } from "./net.js";
import {
  drawCursorReticle,
  followTank,
  makeCamera,
  renderFrame,
  renderHud,
  type Camera,
} from "./render.js";

type UnifiedNetClient = SinglePlayerNetClient | NetClient;
type UnifiedNetStatus = NetStatus | SinglePlayerNetStatus;

export interface RunOptions {
  canvas: HTMLCanvasElement;
  wsUrl?: string;
  guestName: string;
  singlePlayer?: boolean;
}

export interface RunHandle {
  stop(): void;
  getStatus(): UnifiedNetStatus;
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
  const interp = new SnapshotInterpolator();
  let yourTank: TankState | null = null;
  let status: UnifiedNetStatus = "connecting";
  let clientTick = 0;
  let lastFrameMs = performance.now();

  const net: UnifiedNetClient =
    (opts.singlePlayer ?? false)
      ? new SinglePlayerNetClient({
          onMessage: (msg: ServerMessage) => {
            if (msg.type === ServerMessageType.WELCOME) {
              yourTankId = msg.yourTankId;
            } else if (msg.type === ServerMessageType.SNAPSHOT) {
              lastSnapshot = msg.snapshot;
              interp.push(msg.snapshot, performance.now());
              yourTank = lastSnapshot.tanks.find((t) => t.id === yourTankId) ?? null;
              const target = input.getCommandTarget();
              if (target && yourTank) {
                const dx = target.x - yourTank.x;
                const dy = target.y - yourTank.y;
                if (Math.hypot(dx, dy) <= COMMAND_ARRIVAL_RADIUS * 2) input.clearCommandTarget();
              }
            } else if (msg.type === ServerMessageType.EVENT) {
              // Inline event handling could trigger sound/particles. Stubbed for now.
            }
          },
          onStatus: (s) => {
            status = s;
          },
        })
      : new NetClient({
          url: opts.wsUrl!,
          guestName: opts.guestName,
          onMessage: (msg: ServerMessage) => {
            if (msg.type === ServerMessageType.WELCOME) {
              yourTankId = msg.yourTankId;
            } else if (msg.type === ServerMessageType.SNAPSHOT) {
              lastSnapshot = msg.snapshot;
              interp.push(msg.snapshot, performance.now());
              yourTank = lastSnapshot.tanks.find((t) => t.id === yourTankId) ?? null;
              const target = input.getCommandTarget();
              if (target && yourTank) {
                const dx = target.x - yourTank.x;
                const dy = target.y - yourTank.y;
                if (Math.hypot(dx, dy) <= COMMAND_ARRIVAL_RADIUS * 2) input.clearCommandTarget();
              }
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

    // Feed the latest world view so clicks can target live enemies/mines.
    if (lastSnapshot) input.updateWorld(lastSnapshot, yourTankId);

    // Send input + queued one-shots
    net.send(input.currentInput(clientTick));
    for (const command of input.consumeCommandQueue(clientTick)) net.send(command);
    for (const fire of input.consumeFireQueue()) net.send(fire);
    for (const mine of input.consumeMineQueue()) net.send(mine);
    for (const use of input.consumeUseItemQueue()) net.send(use);
    for (const dep of input.consumeDepositQueue()) net.send(dep);
    for (const tp of input.consumeTeleportQueue()) net.send(tp);

    // Camera follow
    followTank(camera, yourTank, dt);

    // Render the interpolated view (smooth 60fps between 20Hz snapshots). Input
    // targeting + HUD still use the raw latest snapshot above for accuracy.
    const renderSnap = interp.sample(now, yourTankId) ?? lastSnapshot;

    // Render
    if (renderSnap) {
      renderFrame(ctx, renderSnap, camera, yourTankId, input.getCommandTarget());
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

    // On-screen touch controls (drawn on top of the HUD; no-op on desktop).
    input.drawTouch(ctx);

    // Desktop cursor reticle — shows whether a click will fire / loot / move.
    // Hidden while dead (no actionable click) and on touch (getCursor → null).
    const cursor = input.getCursor();
    if (cursor && !(yourTank?.isDead ?? false)) {
      drawCursorReticle(ctx, cursor.x, cursor.y, cursor.kind);
    }

    rafHandle = requestAnimationFrame(frame);
  }
  rafHandle = requestAnimationFrame(frame);

  const debugWindow = window as unknown as {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  };
  debugWindow.render_game_to_text = () =>
    JSON.stringify({
      coordinateSystem: "world origin top-left, x right, y down",
      status,
      yourTankId,
      commandTarget: input.getCommandTarget(),
      tank: yourTank
        ? {
            x: Math.round(yourTank.x),
            y: Math.round(yourTank.y),
            fuel: Math.round(yourTank.fuel),
            rank: yourTank.rank,
            ammo: yourTank.ammo,
            isDead: yourTank.isDead,
          }
        : null,
      snapshot: lastSnapshot
        ? {
            tick: lastSnapshot.tick,
            tanks: lastSnapshot.tanks.length,
            projectiles: lastSnapshot.projectiles.length,
            projectileVectors: lastSnapshot.projectiles.slice(-3).map((p) => ({
              kind: p.kind,
              vx: Math.round(p.vx),
              vy: Math.round(p.vy),
            })),
            pickups: lastSnapshot.pickups.length,
            visibleMines: lastSnapshot.visibleMines.length,
          }
        : null,
    });
  debugWindow.advanceTime = () => {
    if (lastSnapshot) renderFrame(ctx, lastSnapshot, camera, yourTankId, input.getCommandTarget());
  };

  return {
    stop() {
      cancelAnimationFrame(rafHandle);
      input.detach();
      if ("destroy" in net) {
        (net as { destroy: () => void }).destroy();
      } else {
        (net as { close: () => void }).close();
      }
    },
    getStatus: () => status,
  };
}
