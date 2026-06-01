import {
  ItemType,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_FUEL,
  ProjectileKind,
  TANK_RADIUS,
  TeamColor,
  type GameStateSnapshot,
  type PickupState,
  type ProjectileState,
  type TankState,
} from "@shared/types";

// Terrain types for visual enhancement. Themed after Command & Conquer:
// Red Alert's temperate theater — grass, ore fields, water, rock, walls.
enum TerrainType {
  EMPTY = "EMPTY",
  WALL = "WALL",
  WATER = "WATER",
  FOREST = "FOREST",
  ROCK = "ROCK",
  /** Red Alert gold ore field — clustered glittering nuggets. */
  ORE = "ORE",
}

// Terrain data structure. Shape jitter (forest tufts, rock vertices) is
// precomputed at init time so the terrain stays put instead of flickering —
// the renderer must never call Math.random() per frame.
interface TerrainCell {
  type: TerrainType;
  x: number;
  y: number;
  /** Precomputed forest tuft offsets, in tile-fractions of size. */
  tufts?: Array<{ ox: number; oy: number }>;
  /** Precomputed rock outline radii (one per hexagon vertex), as fractions. */
  rockRadii?: number[];
  /** Precomputed ore nugget positions/sizes, in tile-fractions. */
  oreBits?: Array<{ ox: number; oy: number; r: number }>;
}

// ── Command & Conquer: Red Alert palette ───────────────────────────────────
// Temperate-theater battlefield: olive ground, gold ore, steel-and-amber HUD.
const RA = {
  groundDark: "#2c3320", // base battlefield dirt/grass (darkest)
  groundLite: "#3a4429", // lighter grass patches
  grid: "#222a18", // faint field gridlines
  oreGold: "#e8b923", // Red Alert ore yellow-gold
  oreGlint: "#fff1b8",
  water: "#1f4e6b",
  waterLite: "#2f6f93",
  rock: "#6b6253", // cliffs / rocky outcrops
  rockDark: "#4a443a",
  wall: "#8a8378", // concrete / sandbag wall
  steel: "#1b1d18", // HUD panel fill
  steelEdge: "#5c6347", // HUD panel bevel
  amber: "#e8b923", // HUD text / accents (RA EVA amber)
  amberDim: "#e8b92399",
} as const;

// Hit effect types
enum HitEffectType {
  BULLET = "BULLET",
  MISSILE = "MISSILE",
  MINE = "MINE",
}

interface HitEffect {
  x: number;
  y: number;
  type: HitEffectType;
  frame: number;
  maxFrames: number;
}

interface DeathOverlay {
  isDead: boolean;
  respawnTimer: number;
  opacity: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

// Faction colors, tuned to Red Alert's multiplayer house palette
// (Allies gold, Soviet red, plus blue and purple house colors).
const TEAM_COLORS: Record<TeamColor, string> = {
  [TeamColor.BLUE]: "#2f7fd6",
  [TeamColor.RED]: "#c0392b",
  [TeamColor.ORANGE]: "#e8b923",
  [TeamColor.PURPLE]: "#8e44ad",
};

const PICKUP_GLYPHS: Record<ItemType, string> = {
  [ItemType.FUEL_CRATE]: "F",
  [ItemType.MISSILE]: "M",
  [ItemType.MINE_PACK]: "■",
  [ItemType.SHIELD]: "S",
  [ItemType.RADAR]: "R",
  [ItemType.TELEPORT_CHARGE]: "T",
};

// Terrain colors (Red Alert temperate palette)
const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.EMPTY]: RA.groundDark,
  [TerrainType.WALL]: RA.wall,
  [TerrainType.WATER]: RA.water,
  [TerrainType.FOREST]: "#2f5128", // dark pine green
  [TerrainType.ROCK]: RA.rock,
  [TerrainType.ORE]: RA.oreGold,
};

// Hit effect colors
const HIT_EFFECT_COLORS: Record<HitEffectType, string> = {
  [HitEffectType.BULLET]: "#facc15",
  [HitEffectType.MISSILE]: "#ef4444",
  [HitEffectType.MINE]: "#8b5cf6",
};

// Color utility functions
function lightenColor(color: string, amount: number): string {
  const hex = color.replace("#", "");
  const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function darkenColor(color: string, amount: number): string {
  const hex = color.replace("#", "");
  const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - Math.round(255 * amount));
  const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - Math.round(255 * amount));
  const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Global terrain system
const terrain: TerrainCell[] = [];

// Active hit effects
const hitEffects: HitEffect[] = [];

// ── Explosion particle system (death / mine / missile blasts) ──────────────
interface Explosion {
  x: number;
  y: number;
  age: number; // seconds
  life: number; // total lifetime in seconds
  radius: number; // peak fireball radius in world units
  sparks: Array<{ ang: number; speed: number; len: number }>;
}
const explosions: Explosion[] = [];
/** Snapshot ticks whose events we've already turned into effects (dedupe). */
const processedEventTicks = new Set<number>();

/** Spawn a fireball + shockwave + flying sparks at a world position. */
export function spawnExplosion(x: number, y: number, scale = 1): void {
  const sparks = Array.from({ length: Math.round(10 * scale) }, () => ({
    ang: Math.random() * Math.PI * 2,
    speed: 120 + Math.random() * 220,
    len: 6 + Math.random() * 10,
  }));
  explosions.push({ x, y, age: 0, life: 0.6 + 0.2 * scale, radius: 34 * scale, sparks });
  if (explosions.length > 64) explosions.shift();
}

function updateExplosions(dt: number): void {
  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i]!.age += dt;
    if (explosions[i]!.age >= explosions[i]!.life) explosions.splice(i, 1);
  }
}

/**
 * Turn this snapshot's combat events into explosions, once per tick. Called
 * from renderFrame; deduped so the same 20 Hz snapshot rendered across many
 * rAF frames only fires effects a single time.
 */
function processSnapshotEvents(snap: GameStateSnapshot): void {
  if (processedEventTicks.has(snap.tick)) return;
  processedEventTicks.add(snap.tick);
  if (processedEventTicks.size > 256) {
    // Keep the dedupe set bounded.
    for (const t of processedEventTicks) {
      processedEventTicks.delete(t);
      if (processedEventTicks.size <= 128) break;
    }
  }
  for (const ev of snap.events ?? []) {
    if (ev.kind !== "death" && ev.kind !== "mine_detonate") continue;
    const subject = snap.tanks.find((t) => t.id === ev.subjectId);
    if (subject) spawnExplosion(subject.x, subject.y, ev.kind === "death" ? 1.4 : 1);
  }
}

function drawExplosion(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  ex: Explosion,
): void {
  const p = project(cam, W, H, ex.x, ex.y);
  const t = ex.age / ex.life; // 0..1
  const z = cam.zoom;
  ctx.save();

  // Expanding shockwave ring.
  ctx.globalAlpha = (1 - t) * 0.6;
  ctx.strokeStyle = "#ffd27f";
  ctx.lineWidth = 2 * z;
  ctx.beginPath();
  ctx.arc(p.x, p.y, ex.radius * z * (0.4 + t * 1.6), 0, Math.PI * 2);
  ctx.stroke();

  // Fireball core (shrinks/fades), white → amber → red.
  const core = ex.radius * z * (1 - t * 0.6);
  const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, core);
  grad.addColorStop(0, `rgba(255,255,220,${(1 - t).toFixed(3)})`);
  grad.addColorStop(0.5, `rgba(232,150,35,${(0.9 * (1 - t)).toFixed(3)})`);
  grad.addColorStop(1, `rgba(150,40,20,0)`);
  ctx.globalAlpha = 1;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(0.1, core), 0, Math.PI * 2);
  ctx.fill();

  // Flying sparks.
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = "#ffe9a8";
  ctx.lineWidth = 1.5 * z;
  for (const s of ex.sparks) {
    const d = s.speed * ex.age * z;
    const sx = p.x + Math.cos(s.ang) * d;
    const sy = p.y + Math.sin(s.ang) * d;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - Math.cos(s.ang) * s.len * z, sy - Math.sin(s.ang) * s.len * z);
    ctx.stroke();
  }
  ctx.restore();
}

/** Soft elliptical drop shadow under a world entity, for depth. */
function drawShadow(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  wx: number,
  wy: number,
  rWorld: number,
): void {
  const p = project(cam, W, H, wx, wy);
  const r = rWorld * cam.zoom;
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(p.x + r * 0.25, p.y + r * 0.4, r * 1.05, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Death overlay state
let deathOverlay: DeathOverlay = { isDead: false, respawnTimer: 0, opacity: 0 };

// Minimap state
const MINIMAP_SIZE = 160;
const MINIMAP_SCALE = MAP_WIDTH / MINIMAP_SIZE;

// Kill feed state
interface KillFeedItem {
  text: string;
  time: number;
}

const KILL_FEED_MAX_ITEMS = 5;
const killFeed: KillFeedItem[] = [];

// Team scores
interface TeamScores {
  [TeamColor.RED]: number;
  [TeamColor.BLUE]: number;
  [TeamColor.ORANGE]: number;
  [TeamColor.PURPLE]: number;
}

let teamScores: TeamScores = {
  [TeamColor.RED]: 0,
  [TeamColor.BLUE]: 0,
  [TeamColor.ORANGE]: 0,
  [TeamColor.PURPLE]: 0,
};

interface KillCount {
  [key: string]: number; // tank.id -> kill count
}

let killCounts: KillCount = {};

// Cooldown system state
interface CooldownState {
  missiles: number;
  mines: number;
  shields: number;
  radar: number;
  teleports: number;
}

let cooldowns: CooldownState = {
  missiles: 0,
  mines: 0,
  shields: 0,
  radar: 0,
  teleports: 0,
};

// Precompute the stable shape jitter for a single terrain cell.
function decorateCell(cell: TerrainCell): TerrainCell {
  if (cell.type === TerrainType.FOREST) {
    cell.tufts = Array.from({ length: 4 }, () => ({
      ox: (Math.random() - 0.5) * 0.7,
      oy: (Math.random() - 0.5) * 0.7,
    }));
  } else if (cell.type === TerrainType.ROCK) {
    cell.rockRadii = Array.from({ length: 6 }, () => 0.8 + Math.random() * 0.4);
  } else if (cell.type === TerrainType.ORE) {
    // A cluster of small gold nuggets, like a Red Alert ore field.
    cell.oreBits = Array.from({ length: 14 }, () => ({
      ox: (Math.random() - 0.5) * 0.9,
      oy: (Math.random() - 0.5) * 0.9,
      r: 0.06 + Math.random() * 0.07,
    }));
  }
  return cell;
}

// Initialize terrain system. Features are sparse and spaced on a coarse grid so
// the arena reads as scattered cover, not a wall of overlapping blobs.
export function initTerrain(): void {
  terrain.length = 0; // Clear existing terrain

  // One feature per coarse cell, ~34% populated. Red Alert mix: lots of
  // tree stands and gold ore fields, with water and rocky outcrops between.
  const gridStep = 256;
  const weighted: TerrainType[] = [
    TerrainType.FOREST,
    TerrainType.FOREST,
    TerrainType.ORE,
    TerrainType.ORE,
    TerrainType.WATER,
    TerrainType.ROCK,
  ];
  for (let x = gridStep / 2; x < MAP_WIDTH; x += gridStep) {
    for (let y = gridStep / 2; y < MAP_HEIGHT; y += gridStep) {
      if (Math.random() > 0.34) continue;
      const type = weighted[Math.floor(Math.random() * weighted.length)]!;
      // Jitter placement within the cell so the grid isn't obvious.
      const jx = x + (Math.random() - 0.5) * gridStep * 0.4;
      const jy = y + (Math.random() - 0.5) * gridStep * 0.4;
      terrain.push(decorateCell({ type, x: jx, y: jy }));
    }
  }

  // A handful of solid walls/rocks as hard cover.
  for (let i = 0; i < 10; i++) {
    const type = Math.random() > 0.5 ? TerrainType.WALL : TerrainType.ROCK;
    terrain.push(
      decorateCell({
        type,
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
      }),
    );
  }
}

// Add hit effect
export function addHitEffect(x: number, y: number, type: HitEffectType): void {
  hitEffects.push({
    x,
    y,
    type,
    frame: 0,
    maxFrames: type === HitEffectType.BULLET ? 2 : type === HitEffectType.MISSILE ? 3 : 4,
  });
}

// Update hit effects
export function updateHitEffects(): void {
  for (let i = hitEffects.length - 1; i >= 0; i--) {
    hitEffects[i].frame++;
    if (hitEffects[i].frame >= hitEffects[i].maxFrames) {
      hitEffects.splice(i, 1);
    }
  }
}

// Set death overlay
export function setDeathOverlay(isDead: boolean, respawnTimer: number = 0): void {
  deathOverlay.isDead = isDead;
  deathOverlay.respawnTimer = respawnTimer;
  deathOverlay.opacity = isDead ? 0.8 : 0;
}

export function makeCamera(): Camera {
  return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2, zoom: 1 };
}

/** Smoothly track the local tank with the camera. */
export function followTank(cam: Camera, tank: TankState | null, dt: number): void {
  if (!tank) return;
  const k = Math.min(1, dt * 5);
  cam.x += (tank.x - cam.x) * k;
  cam.y += (tank.y - cam.y) * k;
}

/** Project a world point through the camera to screen coords. */
function project(
  cam: Camera,
  canvasW: number,
  canvasH: number,
  wx: number,
  wy: number,
): { x: number; y: number } {
  const x = (wx - cam.x) * cam.zoom + canvasW / 2;
  const y = (wy - cam.y) * cam.zoom + canvasH / 2;
  return { x, y };
}

// Update terrain and effects (call this each frame)
export function updateRenderSystem(): void {
  updateHitEffects();
  updateKillFeed();
  // Update team scores and kill counts when available
  // (this will be called when we have a snapshot)

  // Animate death overlay if needed
  if (deathOverlay.isDead && deathOverlay.opacity < 0.8) {
    deathOverlay.opacity = Math.min(0.8, deathOverlay.opacity + 0.02);
  } else if (!deathOverlay.isDead && deathOverlay.opacity > 0) {
    deathOverlay.opacity = Math.max(0, deathOverlay.opacity - 0.02);
  }
}

/** Render the full frame from a snapshot. */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  snap: GameStateSnapshot,
  cam: Camera,
  yourTankId: string,
  commandTarget: { x: number; y: number } | null = null,
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // Initialize terrain system on first frame
  if (terrain.length === 0) {
    initTerrain();
  }

  // Background — Red Alert temperate battlefield ground.
  ctx.fillStyle = RA.groundDark;
  ctx.fillRect(0, 0, W, H);
  drawGroundTexture(ctx, cam, W, H);

  // Draw terrain
  drawTerrain(ctx, cam, W, H);

  drawGrid(ctx, cam, W, H);
  drawMapBounds(ctx, cam, W, H);

  // Turn this tick's death/mine events into explosions, then advance them.
  processSnapshotEvents(snap);
  updateExplosions(1 / 60);

  // Pickups (drawn below tanks) as beveled supply crates.
  for (const pk of snap.pickups) {
    drawShadow(ctx, cam, W, H, pk.x, pk.y, 10);
    drawPickup(ctx, cam, W, H, pk);
  }

  // Visible mines (own / ally / radar-detected) — spiked sea-mine look.
  for (const m of snap.visibleMines) {
    const p = project(cam, W, H, m.x, m.y);
    const r = 8 * cam.zoom;
    ctx.save();
    ctx.fillStyle = "#1a1a1a";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(a) * r * 1.5, p.y + Math.sin(a) * r * 1.5);
      ctx.lineWidth = 2 * cam.zoom;
      ctx.strokeStyle = "#1a1a1a";
      ctx.stroke();
    }
    ctx.fillStyle = "#c0392b";
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ff8a7a";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Projectiles
  for (const proj of snap.projectiles) {
    drawProjectile(ctx, cam, W, H, proj);
  }

  // Draw hit effects + explosions (above ground, below HUD).
  for (const effect of hitEffects) {
    drawHitEffect(ctx, cam, W, H, effect);
  }
  for (const ex of explosions) {
    drawExplosion(ctx, cam, W, H, ex);
  }

  if (commandTarget) {
    drawCommandTarget(ctx, cam, W, H, commandTarget);
  }

  // Tanks (with drop shadows for depth).
  for (const t of snap.tanks) {
    if (!t.isDead) drawShadow(ctx, cam, W, H, t.x, t.y, TANK_RADIUS);
    drawTank(ctx, cam, W, H, t, t.id === yourTankId);
  }

  // Screen-space HUD layers.
  drawMinimap(ctx, cam, W, H, snap, yourTankId);
  drawScoreboard(ctx, W, H);
  drawKillFeed(ctx, W, H);

  // CRT war-room overlay (vignette + scanlines) — drawn last.
  drawCrtOverlay(ctx, W, H);
}

/** A Red Alert supply crate: beveled wooden box with a colored equipment band. */
function drawPickup(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  pk: PickupState,
): void {
  const colors: Record<ItemType, string> = {
    [ItemType.FUEL_CRATE]: "#5fa83a",
    [ItemType.MISSILE]: "#c0392b",
    [ItemType.MINE_PACK]: "#8e44ad",
    [ItemType.SHIELD]: "#2f9fd0",
    [ItemType.RADAR]: "#e8b923",
    [ItemType.TELEPORT_CHARGE]: "#a855f7",
  };
  const color = colors[pk.type] ?? "#e8b923";
  const p = project(cam, W, H, pk.x, pk.y);
  const s = 11 * cam.zoom;
  // Gentle bob so crates feel alive without per-frame randomness.
  const bob = Math.sin(Date.now() / 400 + p.x) * 1.5 * cam.zoom;
  const y = p.y + bob;

  ctx.save();
  // Crate body.
  ctx.fillStyle = "#6b5536";
  ctx.fillRect(p.x - s, y - s, s * 2, s * 2);
  // Bevels.
  ctx.fillStyle = "#ffffff2e";
  ctx.fillRect(p.x - s, y - s, s * 2, s * 0.28);
  ctx.fillStyle = "#0000004d";
  ctx.fillRect(p.x - s, y + s - s * 0.28, s * 2, s * 0.28);
  // Colored equipment band.
  ctx.fillStyle = color;
  ctx.fillRect(p.x - s, y - s * 0.34, s * 2, s * 0.68);
  ctx.strokeStyle = "#2218";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(p.x - s, y - s, s * 2, s * 2);
  // Glyph.
  ctx.fillStyle = "#11140c";
  ctx.font = `bold ${Math.max(10, 12 * cam.zoom)}px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(PICKUP_GLYPHS[pk.type] ?? "?", p.x, y);
  ctx.restore();
}

/** Subtle CRT look: dark vignette corners + faint horizontal scanlines. */
function drawCrtOverlay(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.save();
  // Vignette.
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  // Scanlines.
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#000";
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  ctx.restore();
}

function drawCommandTarget(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  target: { x: number; y: number },
): void {
  const p = project(cam, W, H, target.x, target.y);
  const s = 12 * cam.zoom;
  ctx.save();
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - s, p.y);
  ctx.lineTo(p.x + s, p.y);
  ctx.moveTo(p.x, p.y - s);
  ctx.lineTo(p.x, p.y + s);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, s * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, cam: Camera, W: number, H: number): void {
  const step = 64;
  const startX = Math.floor((cam.x - W / (2 * cam.zoom)) / step) * step;
  const startY = Math.floor((cam.y - H / (2 * cam.zoom)) / step) * step;
  const endX = cam.x + W / (2 * cam.zoom);
  const endY = cam.y + H / (2 * cam.zoom);

  ctx.save();
  ctx.strokeStyle = RA.grid;
  ctx.lineWidth = 1;
  for (let x = startX; x < endX; x += step) {
    const a = project(cam, W, H, x, startY);
    const b = project(cam, W, H, x, endY);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = startY; y < endY; y += step) {
    const a = project(cam, W, H, startX, y);
    const b = project(cam, W, H, endX, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMapBounds(ctx: CanvasRenderingContext2D, cam: Camera, W: number, H: number): void {
  const tl = project(cam, W, H, 0, 0);
  const br = project(cam, W, H, MAP_WIDTH, MAP_HEIGHT);
  ctx.save();
  ctx.strokeStyle = RA.steelEdge;
  ctx.lineWidth = 4;
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.strokeStyle = RA.amber + "66";
  ctx.lineWidth = 1;
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.restore();
}

/**
 * Subtle large-scale ground mottling so the battlefield reads as patchy
 * grass/dirt rather than a flat color. Cheap: a sparse static dot grid keyed
 * to world coordinates (deterministic, no per-frame randomness).
 */
function drawGroundTexture(ctx: CanvasRenderingContext2D, cam: Camera, W: number, H: number): void {
  const step = 128;
  const startX = Math.floor((cam.x - W / (2 * cam.zoom)) / step) * step;
  const startY = Math.floor((cam.y - H / (2 * cam.zoom)) / step) * step;
  const endX = cam.x + W / (2 * cam.zoom);
  const endY = cam.y + H / (2 * cam.zoom);
  ctx.save();
  for (let x = startX; x < endX; x += step) {
    for (let y = startY; y < endY; y += step) {
      // Deterministic hash → lighter grass blotch on ~half the cells.
      const h = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      if (h > 0.5 || h < -0.5) continue;
      const p = project(cam, W, H, x + 64, y + 64);
      ctx.fillStyle = RA.groundLite;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 70 * cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawTerrain(ctx: CanvasRenderingContext2D, cam: Camera, W: number, H: number): void {
  const size = 72 * cam.zoom;
  for (const t of terrain) {
    const p = project(cam, W, H, t.x, t.y);

    // Skip anything off-screen — cheap cull, big win on the 2048² map.
    if (p.x < -size || p.x > W + size || p.y < -size || p.y > H + size) continue;

    ctx.save();
    ctx.fillStyle = TERRAIN_COLORS[t.type];

    if (t.type === TerrainType.WALL) {
      // Concrete wall block with a beveled highlight/shadow (RA pillbox feel).
      const s = size;
      ctx.fillStyle = RA.wall;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      ctx.fillStyle = "#ffffff22";
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s * 0.18); // top highlight
      ctx.fillStyle = "#00000044";
      ctx.fillRect(p.x - s / 2, p.y + s / 2 - s * 0.18, s, s * 0.18); // bottom shadow
      ctx.strokeStyle = RA.rockDark;
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
    } else if (t.type === TerrainType.WATER) {
      // Water pool with a lighter inner ripple.
      ctx.fillStyle = RA.water;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = RA.waterLite;
      ctx.beginPath();
      ctx.arc(p.x - size * 0.12, p.y - size * 0.12, size * 0.28, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.type === TerrainType.FOREST) {
      // Tree stand: dark canopy disc plus stable tufts (precomputed offsets).
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3f6b33";
      for (const tuft of t.tufts ?? []) {
        ctx.beginPath();
        ctx.arc(p.x + tuft.ox * size, p.y + tuft.oy * size, size / 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (t.type === TerrainType.ORE) {
      // Red Alert ore field: a scatter of glittering gold nuggets.
      for (const bit of t.oreBits ?? []) {
        const bx = p.x + bit.ox * size;
        const by = p.y + bit.oy * size;
        ctx.fillStyle = RA.oreGold;
        ctx.beginPath();
        ctx.arc(bx, by, bit.r * size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = RA.oreGlint;
        ctx.beginPath();
        ctx.arc(bx - bit.r * size * 0.3, by - bit.r * size * 0.3, bit.r * size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (t.type === TerrainType.ROCK) {
      // Irregular boulder (stable vertex radii) with a top highlight.
      const radii = t.rockRadii ?? [1, 1, 1, 1, 1, 1];
      ctx.fillStyle = RA.rock;
      ctx.beginPath();
      for (let i = 0; i < radii.length; i++) {
        const angle = (i / radii.length) * Math.PI * 2;
        const radius = (size / 2) * radii[i]!;
        const x = p.x + Math.cos(angle) * radius;
        const y = p.y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff1f";
      ctx.beginPath();
      ctx.arc(p.x - size * 0.12, p.y - size * 0.14, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawTank(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  t: TankState,
  isLocal: boolean,
): void {
  const p = project(cam, W, H, t.x, t.y);
  const r = TANK_RADIUS * cam.zoom;
  const teamColor = TEAM_COLORS[t.team] ?? "#666";

  ctx.save();

  // Spawn-protection ring
  if (t.isSpawnProtected) {
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Shield: a translucent energy bubble with a bright rim.
  if (t.hasShield) {
    ctx.save();
    const sb = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r + 7);
    sb.addColorStop(0, "#22d3ee00");
    sb.addColorStop(1, "#22d3ee44");
    ctx.fillStyle = sb;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#67e8f9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Hull with gradient shading
  ctx.translate(p.x, p.y);
  ctx.rotate(t.angle);

  // Create gradient for hull (lighter top, darker bottom)
  const hullGradient = ctx.createLinearGradient(-r, -r * 0.7, -r, r * 0.7);
  const baseColor = t.isDead ? "#333" : teamColor;
  hullGradient.addColorStop(0, t.isDead ? "#444" : lightenColor(baseColor, 0.3));
  hullGradient.addColorStop(1, t.isDead ? "#222" : darkenColor(baseColor, 0.3));

  ctx.fillStyle = hullGradient;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(-r, -r * 0.7, r * 2, r * 1.4);
  ctx.fill();
  ctx.stroke();

  // Track detail: two thin black lines on hull sides
  ctx.fillStyle = "#000";
  ctx.fillRect(-r + 2, -r * 0.7, 2, r * 1.4);
  ctx.fillRect(r - 4, -r * 0.7, 2, r * 1.4);

  ctx.rotate(-t.angle);

  // Turret with gradient shading
  ctx.rotate(t.turretAngle);
  const turretGradient = ctx.createLinearGradient(0, -r * 0.18, 0, r * 0.18);
  turretGradient.addColorStop(0, "#333");
  turretGradient.addColorStop(1, "#000");
  ctx.fillStyle = turretGradient;
  ctx.fillRect(0, -r * 0.18, r * 1.6, r * 0.36);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Barrel tip: small dark rectangle at barrel end
  ctx.fillStyle = "#000";
  ctx.fillRect(r * 0.8, -r * 0.09, r * 0.4, r * 0.18);

  ctx.restore();

  // Team stripes: colored border (3px) around hull
  ctx.save();
  ctx.strokeStyle = teamColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Local-tank highlight
  if (isLocal) {
    ctx.save();
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Name + fuel bar (RA amber callsign over a thin steel-framed gauge).
  ctx.save();
  ctx.font = `${Math.max(10, 11 * cam.zoom)}px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#000a";
  ctx.fillText(t.name, p.x + 1, p.y - r - 13); // text shadow
  ctx.fillStyle = RA.amber;
  ctx.fillText(t.name, p.x, p.y - r - 14);
  // Fuel bar.
  const barW = r * 2.6;
  const barH = 4;
  const bx = p.x - barW / 2;
  const by = p.y - r - 9;
  ctx.fillStyle = "#000a";
  ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
  const pct = Math.max(0, Math.min(1, t.fuel / MAX_FUEL));
  ctx.fillStyle = pct > 0.5 ? "#5fa83a" : pct > 0.2 ? RA.amber : "#c0392b";
  ctx.fillRect(bx, by, barW * pct, barH);
  ctx.restore();

  // Armor readout: a thin segmented ring around the tank (front / sides / rear
  // arcs), color-coded by integrity. Replaces the old full-body color fill so
  // the tank sprite itself stays readable. Hidden when dead.
  if (!t.isDead) {
    const armorColor = (pct: number): string =>
      pct > 0.7 ? "#5fa83a" : pct > 0.4 ? "#e8b923" : "#c0392b";
    const ringR = r + 5;
    const gap = 0.18; // radians of empty space between segments
    // Arcs are placed relative to the hull heading (t.angle): front faces +x.
    const segments: Array<{ center: number; half: number; pct: number }> = [
      { center: 0, half: Math.PI * 0.28, pct: t.armor.front / 100 }, // front
      { center: Math.PI, half: Math.PI * 0.22, pct: t.armor.rear / 100 }, // rear
      { center: -Math.PI / 2, half: Math.PI * 0.2, pct: t.armor.side / 100 }, // left
      { center: Math.PI / 2, half: Math.PI * 0.2, pct: t.armor.side / 100 }, // right
    ];
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.lineCap = "butt";
    for (const seg of segments) {
      const a0 = t.angle + seg.center - seg.half + gap / 2;
      const a1 = t.angle + seg.center + seg.half - gap / 2;
      // Track (dark) behind the segment.
      ctx.strokeStyle = "#0009";
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR, a0, a1);
      ctx.stroke();
      // Filled portion proportional to integrity.
      ctx.strokeStyle = armorColor(seg.pct);
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR, a0, a0 + (a1 - a0) * Math.max(0, Math.min(1, seg.pct)));
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawHitEffect(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  effect: HitEffect,
): void {
  const p = project(cam, W, H, effect.x, effect.y);
  const progress = effect.frame / effect.maxFrames;
  const alpha = 1 - progress;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (effect.type === HitEffectType.BULLET) {
    // Yellow flash ring
    ctx.strokeStyle = HIT_EFFECT_COLORS[HitEffectType.BULLET];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20 * cam.zoom, 0, Math.PI * 2);
    ctx.stroke();
  } else if (effect.type === HitEffectType.MISSILE) {
    // Orange burst animation
    ctx.fillStyle = HIT_EFFECT_COLORS[HitEffectType.MISSILE];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 30 * cam.zoom * (1 - progress * 0.5), 0, Math.PI * 2);
    ctx.fill();
  } else if (effect.type === HitEffectType.MINE) {
    // Red radial flash
    ctx.fillStyle = HIT_EFFECT_COLORS[HitEffectType.MINE];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 25 * cam.zoom * (1 - progress * 0.3), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  snap: GameStateSnapshot,
  yourTankId: string,
): void {
  const minimapX = W - MINIMAP_SIZE - 8;
  const minimapY = 8;

  ctx.save();

  // Minimap background — steel radar panel (RA tactical map).
  ctx.fillStyle = RA.groundDark + "ee";
  ctx.fillRect(minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);
  ctx.strokeStyle = RA.steelEdge;
  ctx.lineWidth = 3;
  ctx.strokeRect(minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);
  ctx.strokeStyle = RA.amber + "66";
  ctx.lineWidth = 1;
  ctx.strokeRect(minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);

  // Find your tank for centering
  const yourTank = snap.tanks.find((t) => t.id === yourTankId);
  const centerX = yourTank ? yourTank.x : MAP_WIDTH / 2;
  const centerY = yourTank ? yourTank.y : MAP_HEIGHT / 2;

  // Draw terrain on minimap
  for (const terrainCell of terrain) {
    if (terrainCell.type === TerrainType.EMPTY) continue;

    const x = minimapX + (terrainCell.x / MAP_WIDTH) * MINIMAP_SIZE;
    const y = minimapY + (terrainCell.y / MAP_HEIGHT) * MINIMAP_SIZE;
    const size = 4;

    ctx.fillStyle = TERRAIN_COLORS[terrainCell.type];
    if (terrainCell.type === TerrainType.WATER) {
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }

  // Draw visible mines
  for (const m of snap.visibleMines) {
    const x = minimapX + (m.x / MAP_WIDTH) * MINIMAP_SIZE;
    const y = minimapY + (m.y / MAP_HEIGHT) * MINIMAP_SIZE;
    ctx.fillStyle = "#ef4444aa";
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw pickups
  for (const pk of snap.pickups) {
    const x = minimapX + (pk.x / MAP_WIDTH) * MINIMAP_SIZE;
    const y = minimapY + (pk.y / MAP_HEIGHT) * MINIMAP_SIZE;

    ctx.fillStyle = "#facc15aa";
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw tanks
  for (const t of snap.tanks) {
    const x = minimapX + (t.x / MAP_WIDTH) * MINIMAP_SIZE;
    const y = minimapY + (t.y / MAP_HEIGHT) * MINIMAP_SIZE;
    const size = t.id === yourTankId ? 3 : 2;
    const color = t.id === yourTankId ? "#facc15" : TEAM_COLORS[t.team] || "#666";

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    // Draw tank direction
    if (t.angle !== undefined) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(t.angle) * size * 2, y + Math.sin(t.angle) * size * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawProjectile(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  p: ProjectileState,
): void {
  const sp = project(cam, W, H, p.x, p.y);
  ctx.save();

  if (p.kind === ProjectileKind.BULLET) {
    // Enhanced bullet with glow trail
    // Glowing effect
    ctx.shadowColor = "#facc15";
    ctx.shadowBlur = 10 * cam.zoom;
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 4 * cam.zoom, 0, Math.PI * 2);
    ctx.fill();

    // Inner circle
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 2 * cam.zoom, 0, Math.PI * 2);
    ctx.fill();

    // Motion trail
    const trailLength = 10;
    for (let i = 0; i < trailLength; i++) {
      const alpha = (1 - i / trailLength) * 0.5;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#facc15";
      const trailX = sp.x - p.vx * i * 0.5;
      const trailY = sp.y - p.vy * i * 0.5;
      ctx.beginPath();
      ctx.arc(trailX, trailY, (4 - i * 0.3) * cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Enhanced missile with trail
    ctx.fillStyle = "#ef4444";
    ctx.translate(sp.x, sp.y);
    ctx.rotate(Math.atan2(p.vy, p.vx));

    // Main missile body
    ctx.fillRect(-8 * cam.zoom, -3 * cam.zoom, 12 * cam.zoom, 6 * cam.zoom);

    // Nose cone
    ctx.fillStyle = "#ef4444aa";
    ctx.beginPath();
    ctx.moveTo(4 * cam.zoom, 0);
    ctx.lineTo(8 * cam.zoom, -3 * cam.zoom);
    ctx.lineTo(8 * cam.zoom, 3 * cam.zoom);
    ctx.closePath();
    ctx.fill();

    // Rocket trail
    const time = Date.now() / 1000;
    const trailLength = 15;
    for (let i = 1; i < trailLength; i++) {
      const alpha = (1 - i / trailLength) * 0.6;
      ctx.globalAlpha = alpha;
      const trailWidth = 6 - i * 0.3;
      const trailX = -8 * cam.zoom - i * 1.2 * cam.zoom;

      ctx.fillStyle = "#ef4444";
      ctx.fillRect(trailX, -trailWidth / 2, 4, trailWidth);
    }

    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/** HUD overlay: fuel bar, ammo, rank, RTT, score line. */
export function renderHud(
  ctx: CanvasRenderingContext2D,
  state: {
    yourTank: TankState | null;
    snap: GameStateSnapshot | null;
    rttMs: number;
    status: string;
    serverTick: number;
  },
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // Compact HUD on small / touch viewports: drop the developer debug lines and
  // the long keyboard hint, which only clutter a phone screen and collide with
  // the minimap. cssW = device-pixel width / DPR ≈ CSS px.
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  const compact = W / dpr < 560 || isTouchDevice();

  ctx.save();
  ctx.font = "12px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = RA.amber + "cc";

  if (!compact) {
    // Top-left: status / tick / rtt (raw debug info)
    ctx.fillText(`srv tick=${state.serverTick}  rtt=${state.rttMs}ms  ws=${state.status}`, 8, 16);

    // Raw debug info area - show more detailed information
    if (state.snap) {
      ctx.fillStyle = RA.amber + "aa";
      ctx.fillText(
        `Tanks: ${state.snap.tanks.length} | Pickups: ${state.snap.pickups.length} | Mines: ${state.snap.visibleMines.length}`,
        8,
        34,
      );
      ctx.fillText(
        `Projectiles: ${state.snap.projectiles.length} | Teams: ${new Set(state.snap.tanks.map((t) => t.team)).size}`,
        8,
        52,
      );
    }
  }

  ctx.fillStyle = RA.amber + "dd";

  if (state.yourTank) {
    const t = state.yourTank;
    // Bottom-left: steel command panel behind fuel + ammo (RA HUD feel).
    const barW = 240;
    const barH = 14;
    const bx = 12;
    const by = H - 64;
    const panelX = bx - 8;
    const panelY = by - 22;
    const panelW = barW + 16;
    const panelH = 74;
    ctx.fillStyle = RA.steel + "e6";
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = RA.steelEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.fillStyle = "#ffffff14"; // top bevel highlight
    ctx.fillRect(panelX, panelY, panelW, 2);

    // Fuel gauge track.
    ctx.fillStyle = "#000000aa";
    ctx.fillRect(bx, by, barW, barH);
    const pct = Math.max(0, Math.min(1, t.fuel / MAX_FUEL));

    // Low fuel warning
    let fuelColor = "#5fa83a"; // RA olive-green "ok"
    let fuelText = `FUEL ${Math.round(t.fuel)} / ${MAX_FUEL}`;
    if (pct <= 0.05) {
      fuelColor = "#c0392b";
      fuelText = "LOW FUEL! " + fuelText;
    } else if (pct <= 0.2) {
      fuelColor = RA.amber;
    } else if (pct <= 0.3) {
      // Medium warning with intermittent flash
      const flash = Math.floor(Date.now() / 500) % 2;
      if (flash === 0) fuelColor = RA.amber + "aa";
    }

    ctx.fillStyle = fuelColor;
    ctx.fillRect(bx, by, barW * pct, barH);
    ctx.strokeStyle = RA.steelEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, barW, barH);
    ctx.fillStyle = RA.amber;
    ctx.fillText(fuelText, bx, by - 6);

    // Bottom-left: ammo with cooldown feedback
    ctx.fillStyle = RA.amber;
    let ammoText = `MIS ${t.ammo.missiles}   MINE ${t.ammo.mines}   TP ${t.ammo.teleports}   SH ${t.ammo.shields}   RAD ${t.ammo.radar}   RANK ${t.rank}`;

    // Add cooldown indicators
    if (t.ammo.missiles === 0) ammoText += " [⏳]";
    if (t.ammo.mines === 0) ammoText += " [⏳]";
    if (t.ammo.shields === 0) ammoText += " [⏳]";

    ctx.fillText(ammoText, bx, by + barH + 14);

    if (state.snap) {
      ctx.fillText(
        `RADAR sees fuel/equipment:${state.snap.pickups.length} mines:${state.snap.visibleMines.length}`,
        bx,
        by + barH + 28,
      );
    }

    // Right-aligned visible tanks count
    if (state.snap) {
      const visible = state.snap.tanks.length;
      ctx.textAlign = "right";
      const totalText = `visible tanks: ${visible}`;

      // Condensed format when space is tight
      if (W < 800) {
        ctx.fillText(`${visible} tanks`, W - 8, H - 8);
      } else {
        ctx.fillText(totalText, W - 8, H - 8);
      }
    }
  } else {
    ctx.fillText("Waiting for spawn…", 8, H - 8);
  }

  ctx.restore();
  // Controls help line — desktop only. On touch/compact the on-screen buttons
  // are self-explanatory and the long keyboard hint would overlap the minimap.
  if (!compact) {
    ctx.save();
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "#facc1599";
    ctx.textAlign = "right";
    ctx.fillText(
      "LMB enemy=fire / ground=move · Space fire · RMB/K missile · M mine · R radar · T teleport · F deposit fuel · Shift shield · X stop",
      W - 8,
      16,
    );
    ctx.restore();
  }
}

function addKillFeed(text: string): void {
  const now = Date.now();
  killFeed.push({ text, time: now });

  // Keep only the most recent items
  if (killFeed.length > KILL_FEED_MAX_ITEMS) {
    killFeed.shift();
  }
}

function updateKillFeed(): void {
  const now = Date.now();
  // Remove items older than 3 seconds
  for (let i = killFeed.length - 1; i >= 0; i--) {
    if (now - killFeed[i].time > 3000) {
      killFeed.splice(i, 1);
    }
  }
}

function drawKillFeed(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.save();

  const startX = W / 2;
  const startY = 80;
  const lineHeight = 20;

  ctx.font = "14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#facc15dd";

  // Draw from bottom to top (newest at bottom)
  for (let i = 0; i < killFeed.length; i++) {
    const item = killFeed[i];
    const alpha = Math.min(1, (Date.now() - item.time) / 1000); // Fade in
    const y = startY + i * lineHeight;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillText(item.text, startX, y);
    ctx.restore();
  }

  ctx.restore();
}

function updateTeamScores(snap: GameStateSnapshot): void {
  // Reset scores
  teamScores = {
    [TeamColor.RED]: 0,
    [TeamColor.BLUE]: 0,
    [TeamColor.ORANGE]: 0,
    [TeamColor.PURPLE]: 0,
  };

  // Count tanks alive per team
  for (const tank of snap.tanks) {
    if (tank.team && !tank.isDead) {
      teamScores[tank.team] = (teamScores[tank.team] || 0) + 1;
    }
  }
}

function updateKillCounts(snap: GameStateSnapshot): void {
  killCounts = {};
  for (const tank of snap.tanks) {
    killCounts[tank.id] = tank.kills || 0;
  }
}

function drawScoreboard(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.save();

  const scoreboardX = 8;
  const scoreboardY = 60;
  const lineHeight = 18;

  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";

  // Background
  ctx.fillStyle = "#1f1f33aa";
  ctx.fillRect(scoreboardX - 4, scoreboardY - 6, 200, 80);

  // Team scores
  let yOffset = 0;
  for (const team of [TeamColor.RED, TeamColor.BLUE, TeamColor.ORANGE, TeamColor.PURPLE]) {
    const count = teamScores[team] || 0;
    const color = TEAM_COLORS[team] || "#666";

    ctx.fillStyle = color;
    ctx.fillText(`${team}: ${count}`, scoreboardX, scoreboardY + yOffset);
    yOffset += lineHeight;
  }

  ctx.restore();
}

function updateCooldowns(tank: TankState): void {
  // For now, use simple ammo counts as cooldown indicators
  // In a full implementation, this would track actual cooldown timers
  cooldowns.missiles = tank.ammo.missiles;
  cooldowns.mines = tank.ammo.mines;
  cooldowns.shields = tank.ammo.shields;
  cooldowns.radar = tank.ammo.radar;
  cooldowns.teleports = tank.ammo.teleports;
}

function drawCooldownIndicators(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tank: TankState,
): void {
  if (!tank) return;

  ctx.save();

  const indicators = [
    { key: "missiles", label: "MIS", x: 120, y: H - 40 },
    { key: "mines", label: "MINE", x: 180, y: H - 40 },
    { key: "teleports", label: "TP", x: 240, y: H - 40 },
    { key: "shields", label: "SH", x: 300, y: H - 40 },
    { key: "radar", label: "RAD", x: 360, y: H - 40 },
  ];

  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#facc1599";

  for (const indicator of indicators) {
    const value = cooldowns[indicator.key as keyof CooldownState];

    // Background circle
    ctx.fillStyle = value === 0 ? "#ef4444aa" : "#22c55eaa";
    ctx.beginPath();
    ctx.arc(indicator.x, indicator.y, 8, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = "#facc15";
    ctx.fillText(indicator.label, indicator.x, indicator.y + 3);

    // Value
    ctx.fillStyle = value === 0 ? "#ef4444" : "#666";
    ctx.fillText(value.toString(), indicator.x + 15, indicator.y + 3);

    // Cooldown arc for empty items
    if (value === 0) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(indicator.x, indicator.y, 10, 0, Math.PI * 1.5);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// Draw death overlay
if (deathOverlay.isDead) {
  drawDeathOverlay(ctx, W, H);
}

function drawDeathOverlay(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.save();
  ctx.globalAlpha = deathOverlay.opacity;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.fillStyle = "#c0392b";
  ctx.font = "bold 42px 'Courier New', monospace";
  ctx.fillText("DEACTIVATED", W / 2, H / 2 - 10);
  if (deathOverlay.respawnTimer > 0) {
    ctx.fillStyle = "#e8b923";
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillText(
      `Respawning in ${Math.ceil(deathOverlay.respawnTimer / SERVER_TICK_RATE)}…`,
      W / 2,
      H / 2 + 28,
    );
  }
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────
// Touch controls (mobile). Geometry is in canvas-buffer (device-pixel) space,
// matching the coordinates input.ts derives from pointer events, so the same
// numbers drive both hit-testing and drawing.
// ─────────────────────────────────────────────────────────────────────────

export type TouchAction =
  | "fire"
  | "missile"
  | "mine"
  | "radar"
  | "shield"
  | "teleport"
  | "deposit"
  | "stop";

export interface TouchButton {
  id: TouchAction;
  label: string;
  count: number | null;
  enabled: boolean;
  cx: number;
  cy: number;
  r: number;
}

/** True when the device is touch-first (phone/tablet). `?touch=1` forces it on
 *  (handy for previewing touch controls on a desktop); `?touch=0` forces off. */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const q = window.location?.search ?? "";
  if (q.indexOf("touch=1") >= 0) return true;
  if (q.indexOf("touch=0") >= 0) return false;
  return (
    "ontouchstart" in window ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
}

let safeAreaProbe: HTMLDivElement | null = null;
/** Read CSS safe-area insets (notch / home indicator) in CSS pixels. */
function safeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  if (typeof document === "undefined") return { top: 0, right: 0, bottom: 0, left: 0 };
  if (!safeAreaProbe) {
    safeAreaProbe = document.createElement("div");
    safeAreaProbe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) " +
      "env(safe-area-inset-bottom) env(safe-area-inset-left);";
    document.body.appendChild(safeAreaProbe);
  }
  const s = getComputedStyle(safeAreaProbe);
  return {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  };
}

/** Effective device-pixel ratio used to size touch UI (matches main.ts cap). */
function uiDpr(): number {
  return Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
}

const TOUCH_ORDER: Array<{ id: TouchAction; label: string }> = [
  { id: "fire", label: "FIRE" },
  { id: "missile", label: "MIS" },
  { id: "mine", label: "MINE" },
  { id: "radar", label: "RAD" },
  { id: "shield", label: "SHLD" },
  { id: "teleport", label: "TP" },
  { id: "deposit", label: "FUEL" },
  { id: "stop", label: "STOP" },
];

/**
 * Lay out the touch button cluster in the bottom-right (right-thumb reach),
 * 2 columns x 4 rows, index 0 nearest the corner. Positions/sizes are in
 * canvas-buffer pixels. `tank` (may be null) drives ammo counts + enabled state.
 */
export function layoutTouchButtons(W: number, H: number, tank: TankState | null): TouchButton[] {
  const dpr = uiDpr();
  const sa = safeAreaInsets();
  const r = 26 * dpr;
  const gap = 12 * dpr;
  const step = r * 2 + gap;
  const marginX = 14 * dpr + sa.right * dpr;
  const marginY = 14 * dpr + sa.bottom * dpr;
  const startX = W - marginX - r;
  const startY = H - marginY - r;

  return TOUCH_ORDER.map((b, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = startX - col * step;
    const cy = startY - row * step;
    let count: number | null = null;
    let enabled = true;
    if (tank) {
      switch (b.id) {
        case "missile":
          count = tank.ammo.missiles;
          enabled = count > 0;
          break;
        case "mine":
          count = tank.ammo.mines;
          enabled = count > 0;
          break;
        case "radar":
          count = tank.ammo.radar;
          enabled = count > 0;
          break;
        case "shield":
          count = tank.ammo.shields;
          enabled = count > 0 && !tank.hasShield;
          break;
        case "teleport":
          count = tank.ammo.teleports;
          enabled = count > 0;
          break;
        case "deposit":
          enabled = tank.fuel > 100;
          break;
        default:
          enabled = true;
      }
      if (tank.isDead) enabled = false;
    }
    return { id: b.id, label: b.label, count, enabled, cx, cy, r };
  });
}

/** Draw the touch button cluster + teleport-pending hint, RA-styled. */
export function drawTouchControls(
  ctx: CanvasRenderingContext2D,
  buttons: TouchButton[],
  opts: { pendingTeleport: boolean },
): void {
  const W = ctx.canvas.width;
  const dpr = uiDpr();
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const b of buttons) {
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
    ctx.fillStyle = b.enabled ? RA.steel + "e0" : "#11140caa";
    ctx.fill();
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = b.id === "fire" ? RA.amber : RA.steelEdge;
    ctx.stroke();
    if (b.id === "teleport" && opts.pendingTeleport) {
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = "#5fa83a";
      ctx.beginPath();
      ctx.arc(b.cx, b.cy, b.r + 3 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = b.enabled ? RA.amber : RA.amber + "55";
    ctx.font = `bold ${11 * dpr}px 'Courier New', monospace`;
    ctx.fillText(b.label, b.cx, b.cy + (b.count !== null ? -4 * dpr : 0));
    if (b.count !== null) {
      ctx.font = `${10 * dpr}px 'Courier New', monospace`;
      ctx.fillStyle = b.count > 0 ? "#ffffffcc" : "#c0392b";
      ctx.fillText(`x${b.count}`, b.cx, b.cy + 9 * dpr);
    }
  }

  if (opts.pendingTeleport) {
    ctx.fillStyle = "#5fa83a";
    ctx.font = `bold ${13 * dpr}px 'Courier New', monospace`;
    ctx.textAlign = "center";
    ctx.fillText("TAP A DESTINATION TO TELEPORT", W / 2, 22 * dpr);
  }
  ctx.restore();
}

/** Small persistent toggle (top-left) to show/hide the touch cluster. */
export function layoutTouchToggle(): { cx: number; cy: number; r: number } {
  const dpr = uiDpr();
  const sa = safeAreaInsets();
  const r = 18 * dpr;
  return { cx: 14 * dpr + sa.left * dpr + r, cy: 70 * dpr + sa.top * dpr, r };
}

export function drawTouchToggle(ctx: CanvasRenderingContext2D, on: boolean): void {
  const dpr = uiDpr();
  const t = layoutTouchToggle();
  ctx.save();
  ctx.beginPath();
  ctx.arc(t.cx, t.cy, t.r, 0, Math.PI * 2);
  ctx.fillStyle = RA.steel + "cc";
  ctx.fill();
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeStyle = RA.steelEdge;
  ctx.stroke();
  ctx.fillStyle = on ? RA.amber : RA.amber + "66";
  ctx.font = `bold ${14 * dpr}px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(on ? "[#]" : "[ ]", t.cx, t.cy);
  ctx.restore();
}
