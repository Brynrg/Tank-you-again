import { promptGuestName } from "./auth-screen.js";
import { run } from "./loop.js";

const maybeCanvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!maybeCanvas) throw new Error("#game canvas not found");
const canvas: HTMLCanvasElement = maybeCanvas;

// Make the canvas fill the viewport for a real game feel; keep an internal
// resolution for crisp rendering on hi-DPI screens.
fitCanvasToViewport(canvas);
const refit = (): void => fitCanvasToViewport(canvas);
window.addEventListener("resize", refit);
window.addEventListener("orientationchange", () => {
  // iOS reports stale dimensions on the orientationchange tick itself; refit
  // again on the next frame and shortly after once the rotation settles.
  refit();
  requestAnimationFrame(refit);
  setTimeout(refit, 300);
});
// visualViewport tracks the *actually visible* area as the iOS URL bar shows /
// hides and as on-screen keyboards open — the most reliable mobile signal.
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", refit);
  window.visualViewport.addEventListener("scroll", refit);
}

const app = canvas.parentElement ?? document.body;

async function start(): Promise<void> {
  const guestName = await promptGuestName(app);
  const wsUrl = resolveWsUrl();
  run({ canvas, wsUrl, guestName, singlePlayer: true }); // Enable single-player mode
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
  // Prefer visualViewport — on iOS Safari `innerHeight` includes the area behind
  // the URL bar, so the canvas would otherwise be slightly too tall and the
  // bottom HUD would sit under the toolbar. Fall back to innerWidth/Height.
  const vv = window.visualViewport;
  const cssW = Math.round(vv?.width ?? window.innerWidth);
  const cssH = Math.round(vv?.height ?? window.innerHeight);
  // Internal pixel buffer (device pixels, capped DPR for perf on hi-DPI phones).
  c.width = Math.floor(cssW * dpr);
  c.height = Math.floor(cssH * dpr);
  // CSS size
  c.style.width = `${cssW}px`;
  c.style.height = `${cssH}px`;
  // Reset transform; we don't need DPR scaling because all rendering uses
  // canvas-internal pixels directly.
  const ctx = c.getContext("2d");
  if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0);
}
