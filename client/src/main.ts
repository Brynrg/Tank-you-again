import { promptGuestName } from "./auth-screen.js";
import { run } from "./loop.js";

const maybeCanvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!maybeCanvas) throw new Error("#game canvas not found");
const canvas: HTMLCanvasElement = maybeCanvas;

// Make the canvas fill the viewport for a real game feel; keep an internal
// resolution for crisp rendering on hi-DPI screens.
fitCanvasToViewport(canvas);
window.addEventListener("resize", () => fitCanvasToViewport(canvas));

const app = canvas.parentElement ?? document.body;

async function start(): Promise<void> {
  const guestName = await promptGuestName(app);
  const wsUrl = resolveWsUrl();
  run({ canvas, wsUrl, guestName });
}

void start();

function resolveWsUrl(): string {
  const envUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? "";
  if (envUrl) return envUrl;
  // In dev builds, fall back to a local server. In production this branch is
  // tree-shaken so the bundle never references the local hostname directly
  // (the portal's broken-path scanner rejects localhost strings).
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return `ws://${window.location.hostname || "localhost"}:3001/ws`;
  }
  return "wss://tank-you-again.fly.dev/ws";
}

function fitCanvasToViewport(c: HTMLCanvasElement): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Internal pixel buffer
  c.width = Math.floor(window.innerWidth * dpr);
  c.height = Math.floor(window.innerHeight * dpr);
  // CSS size
  c.style.width = `${window.innerWidth}px`;
  c.style.height = `${window.innerHeight}px`;
  // Reset transform; we don't need DPR scaling because all rendering uses
  // canvas-internal pixels directly.
  const ctx = c.getContext("2d");
  if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0);
}
