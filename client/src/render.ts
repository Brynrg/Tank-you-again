import {
  FUEL_FIRE_MISSILE,
  FUEL_MINE,
  FUEL_RADAR_SCAN,
  FUEL_SHIELD_PER_SEC,
  FUEL_TELEPORT,
  ItemType,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_FUEL,
  MilitaryRank,
  MINE_ARMING_TICKS,
  POWER_TIER_LABELS,
  POWER_TIER_THRESHOLDS,
  ProjectileKind,
  RANK_ORDER,
  SERVER_TICK_RATE,
  TANK_RADIUS,
  TeamColor,
  VISION_RADIUS,
  type GameStateSnapshot,
  type MineState,
  type PickupState,
  type ProjectileState,
  type SurvivalHudState,
  type TankState,
} from "@shared/types";

// ─────────────────────────────────────────────────────────────────────────
// "Vector Front" visual identity — Battlezone-lineage glow-vector radar look.
//
// One neutral phosphor hue inks every piece of battlefield/grid/HUD geometry;
// value hierarchy (dim ↔ bright) comes from alpha, never from new hues. Four
// fixed, maximally-separated team hues own a team's core glow / hull tint /
// tread trail / projectiles and nothing else. One alarm hue is reserved
// exclusively for danger (armed mines, low fuel, hit feedback). One neutral
// cyan-white owns pickups. See AGENTS.md / the design-review brief for the
// full spec this file implements.
//
// Perf discipline (see the PERFORMANCE note in the brief): live shadowBlur is
// never used here. Static geometry (forest canopies) is pre-baked once to an
// offscreen canvas and drawImage'd every frame. Dynamic glow (hulls, turret
// cores, projectiles, rings) fakes falloff with 2-3 stacked stroke passes of
// decreasing alpha / increasing width under a crisp core stroke.
// ─────────────────────────────────────────────────────────────────────────

// Terrain types — purely decorative client-side dressing (the server has no
// concept of terrain and never collides with it; see AGENTS.md). Shape jitter
// is precomputed at init time so the terrain stays put instead of flickering.
enum TerrainType {
  EMPTY = "EMPTY",
  WALL = "WALL",
  WATER = "WATER",
  FOREST = "FOREST",
  ROCK = "ROCK",
  ORE = "ORE",
}

interface TerrainCell {
  type: TerrainType;
  x: number;
  y: number;
  /** FOREST only: 3-5 overlapping soft-gradient blobs baked ONCE to an
   *  offscreen canvas at init. The live render path is a single drawImage. */
  bitmap?: HTMLCanvasElement;
  /** ROCK only: jittered polygon outline (stroke-only), vertex radii as
   *  fractions of the cell footprint. */
  rockRadii?: number[];
  /** ORE only: cached diamond-blip cluster positions/sizes. */
  oreBits?: Array<{ ox: number; oy: number; r: number }>;
}

// ── Palette ─────────────────────────────────────────────────────────────
const BG_CENTER = "#071012";
const BG_EDGE = "#050a08";
/** Base phosphor, as an "r,g,b" triple for rgba() template use — #39ff8a. */
const PHOSPHOR = "57,255,138";
/** Reserved exclusively for danger states — #ff3b1f. Never used elsewhere. */
const ALARM = "255,59,31";
/** Neutral cyan-white, distinct from all team hues and the alarm hue. */
const PICKUP_HUE = "214,255,246";

const TEAM_RGB: Record<TeamColor, string> = {
  [TeamColor.BLUE]: "36,229,255", // cyan #24e5ff
  [TeamColor.RED]: "255,46,196", // magenta #ff2ec4
  [TeamColor.ORANGE]: "255,176,32", // amber #ffb020
  [TeamColor.PURPLE]: "155,92,255", // violet #9b5cff
};

function rgba(triple: string, a: number): string {
  return `rgba(${triple},${a})`;
}
function phos(a: number): string {
  return rgba(PHOSPHOR, a);
}
function alarmC(a: number): string {
  return rgba(ALARM, a);
}
function teamHue(team: TeamColor): string {
  return TEAM_RGB[team] ?? PHOSPHOR;
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Fuel/HP → color, hue-interpolated base phosphor green → alarm red-orange
 *  as it depletes (the Diorama Command graft). Reused for armor integrity too
 *  — one brightness/hue-meaning law, not a second visual language. */
function healthColor(pct: number): string {
  const t = 1 - Math.max(0, Math.min(1, pct));
  const r = lerpChannel(57, 255, t);
  const g = lerpChannel(255, 59, t);
  const b = lerpChannel(138, 31, t);
  return `${r},${g},${b}`;
}

/** Cheap glow: crisp core stroke plus 2 wider/dimmer passes, instead of live
 *  shadowBlur. Safe at combat density — see the perf note above. */
function glowStrokePath(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  triple: string,
  coreWidth: number,
  coreAlpha: number,
): void {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = coreWidth * 3.4;
  ctx.strokeStyle = rgba(triple, coreAlpha * 0.08);
  ctx.stroke(path);
  ctx.lineWidth = coreWidth * 1.9;
  ctx.strokeStyle = rgba(triple, coreAlpha * 0.22);
  ctx.stroke(path);
  ctx.lineWidth = Math.max(0.75, coreWidth);
  ctx.strokeStyle = rgba(triple, coreAlpha);
  ctx.stroke(path);
}

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

const PICKUP_GLYPH_LABEL: Record<ItemType, string> = {
  [ItemType.FUEL_CRATE]: "FUEL",
  [ItemType.MISSILE]: "MIS",
  [ItemType.MINE_PACK]: "MINE",
  [ItemType.SHIELD]: "SHLD",
  [ItemType.RADAR]: "RAD",
  [ItemType.TELEPORT_CHARGE]: "TP",
};

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

// ── Battlefield persistence: scorch marks under kills ──────────────────────
interface ScorchMark {
  x: number;
  y: number;
  born: number; // Date.now() ms
  r: number; // world-unit radius
  debris: Array<{ ox: number; oy: number; r: number }>;
}
const scorchMarks: ScorchMark[] = [];
const SCORCH_LIFE_MS = 25000;

/** Drop a fading scorch decal + charred debris where a tank died. Called once
 *  per death event (not per frame), so Math.random here is fine. */
function spawnScorch(x: number, y: number): void {
  const debris = Array.from({ length: 5 }, () => ({
    ox: (Math.random() - 0.5) * 30,
    oy: (Math.random() - 0.5) * 30,
    r: 2 + Math.random() * 3,
  }));
  scorchMarks.push({ x, y, born: Date.now(), r: 26 + Math.random() * 8, debris });
  if (scorchMarks.length > 48) scorchMarks.shift();
}

function drawScorchMarks(ctx: CanvasRenderingContext2D, cam: Camera, W: number, H: number): void {
  const now = Date.now();
  for (let i = scorchMarks.length - 1; i >= 0; i--) {
    if (now - scorchMarks[i]!.born > SCORCH_LIFE_MS) scorchMarks.splice(i, 1);
  }
  ctx.save();
  for (const m of scorchMarks) {
    const fade = 1 - (now - m.born) / SCORCH_LIFE_MS;
    const p = project(cam, W, H, m.x, m.y);
    const r = m.r * cam.zoom;
    if (p.x < -r || p.x > W + r || p.y < -r || p.y > H + r) continue;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(4,10,7,${(0.6 * fade).toFixed(3)})`);
    g.addColorStop(0.7, `rgba(5,12,9,${(0.35 * fade).toFixed(3)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(3,8,6,${(0.7 * fade).toFixed(3)})`;
    for (const d of m.debris) {
      ctx.beginPath();
      ctx.arc(p.x + d.ox * cam.zoom, p.y + d.oy * cam.zoom, d.r * cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ── Tread tracks: dashed trails behind moving tanks, in team hue ───────────
interface TreadSample {
  x: number;
  y: number;
  born: number; // Date.now() ms
}
interface TreadHistory {
  team: TeamColor;
  samples: TreadSample[];
}
const treadTracks = new Map<string, TreadHistory>();
const TREAD_LIFE_MS = 8000;

function updateTreadTracks(snap: GameStateSnapshot): void {
  const now = Date.now();
  for (const t of snap.tanks) {
    if (t.isDead) continue;
    let hist = treadTracks.get(t.id);
    if (!hist) {
      hist = { team: t.team, samples: [] };
      treadTracks.set(t.id, hist);
    }
    hist.team = t.team;
    const arr = hist.samples;
    const last = arr[arr.length - 1];
    if (!last || (t.x - last.x) ** 2 + (t.y - last.y) ** 2 >= 12 * 12) {
      arr.push({ x: t.x, y: t.y, born: now });
      if (arr.length > 28) arr.shift();
    }
  }
  for (const [id, hist] of treadTracks) {
    while (hist.samples.length && now - hist.samples[0]!.born > TREAD_LIFE_MS) {
      hist.samples.shift();
    }
    if (hist.samples.length === 0 && !snap.tanks.some((t) => t.id === id)) treadTracks.delete(id);
  }
}

/** ctx.setLineDash dashed trail behind the hull, dash-phase animated per
 *  frame — per-segment alpha so the trail actually fades with age. */
function drawTreadTracks(ctx: CanvasRenderingContext2D, cam: Camera, W: number, H: number): void {
  const now = Date.now();
  const dashPhase = -(now / 40) % 10;
  ctx.save();
  ctx.lineCap = "round";
  for (const hist of treadTracks.values()) {
    const arr = hist.samples;
    if (arr.length < 2) continue;
    const hue = teamHue(hist.team);
    for (let i = 1; i < arr.length; i++) {
      const a = arr[i - 1]!;
      const b = arr[i]!;
      const fade = 1 - (now - b.born) / TREAD_LIFE_MS;
      if (fade <= 0) continue;
      const pa = project(cam, W, H, a.x, a.y);
      const pb = project(cam, W, H, b.x, b.y);
      const offW = 60;
      if (
        (pa.x < -offW && pb.x < -offW) ||
        (pa.x > W + offW && pb.x > W + offW) ||
        (pa.y < -offW && pb.y < -offW) ||
        (pa.y > H + offW && pb.y > H + offW)
      ) {
        continue;
      }
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = dashPhase;
      ctx.lineWidth = 1.6 * cam.zoom;
      ctx.strokeStyle = rgba(hue, 0.3 * fade);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
}

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
    if (ev.kind === "death" || ev.kind === "mine_detonate") {
      const subject = snap.tanks.find((t) => t.id === ev.subjectId);
      if (subject) {
        spawnExplosion(subject.x, subject.y, ev.kind === "death" ? 1.4 : 1);
        if (ev.kind === "death") spawnScorch(subject.x, subject.y);
      }
    } else if (ev.kind === "kill") {
      const killer = snap.tanks.find((t) => t.id === ev.subjectId);
      const victim = snap.tanks.find((t) => t.id === ev.objectId);
      const streak = Number(ev.payload) || 1;
      const streakSuffix =
        streak >= 7
          ? " ★ UNSTOPPABLE!"
          : streak >= 5
            ? " ★ RAMPAGE!"
            : streak >= 4
              ? " ★ ULTRA KILL"
              : streak >= 3
                ? " ★ TRIPLE KILL"
                : streak >= 2
                  ? " ★ DOUBLE KILL"
                  : "";
      if (killer && victim) addKillFeed(`${killer.name} ▸ ${victim.name}${streakSuffix}`);
      else if (victim) addKillFeed(`${victim.name} destroyed`);
    } else if (ev.kind === "rank_up") {
      const who = snap.tanks.find((t) => t.id === ev.subjectId);
      if (who) addKillFeed(`${who.name} promoted to ${who.rank}`);
    } else if (ev.kind === "tier_up") {
      const who = snap.tanks.find((t) => t.id === ev.subjectId);
      const tier = Number(ev.payload);
      const label = POWER_TIER_LABELS[tier] ?? "";
      const nextKills = POWER_TIER_THRESHOLDS[tier + 1];
      const suffix = nextKills != null ? ` (next tier: ${nextKills} kills)` : " — MAX POWER";
      if (who) addKillFeed(`⚡ ${who.name} reached TIER ${tier}: ${label}${suffix}`);
    }
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

  // Expanding shockwave ring — phosphor bright, fading.
  ctx.globalAlpha = (1 - t) * 0.6;
  ctx.strokeStyle = phos(1);
  ctx.lineWidth = 2 * z;
  ctx.beginPath();
  ctx.arc(p.x, p.y, ex.radius * z * (0.4 + t * 1.6), 0, Math.PI * 2);
  ctx.stroke();

  // Fireball core (shrinks/fades): white-hot center → alarm edge → transparent.
  const core = ex.radius * z * (1 - t * 0.6);
  const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, core);
  grad.addColorStop(0, `rgba(255,255,255,${(1 - t).toFixed(3)})`);
  grad.addColorStop(0.5, rgba(ALARM, 0.85 * (1 - t)));
  grad.addColorStop(1, "rgba(255,59,31,0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(0.1, core), 0, Math.PI * 2);
  ctx.fill();

  // Flying sparks — alarm streaks.
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = alarmC(1);
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

// Death overlay state
let deathOverlay: DeathOverlay = { isDead: false, respawnTimer: 0, opacity: 0 };

// First-run coachmark: a short, dismissible teaching panel shown once per
// browser. Gated by localStorage so returning players never see it again.
const COACH_DURATION_MS = 14000;
let coachStartMs: number | null = null;
let coachSeen: boolean = (() => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("tya_coach_seen") === "1";
  } catch {
    return false;
  }
})();
function markCoachSeen(): void {
  coachSeen = true;
  try {
    localStorage.setItem("tya_coach_seen", "1");
  } catch {
    /* private mode / blocked storage — fine, it just shows again next session */
  }
}

// Minimap state
const MINIMAP_SIZE = 160;

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

// ── Masked-radar fog-of-war: persistent per-player "explored" buffer ───────
// A coarse ratchet grid (never decreases once set) standing in for the
// offscreen alpha-buffer in the brief — cheaper than canvas pixel readback
// and sampled with a single array lookup per on-screen object. This gates
// only client-invented decoration (terrain/grid); every entity in the
// snapshot is already server-vision-filtered, so it always renders at full
// brightness. Never-seen = skip draw (background void reads as near-black);
// previously-seen-now-unseen = dim phosphor (~12%); currently in vision =
// full brightness.
const FOG_CELL = 64;
const FOG_COLS = Math.ceil(MAP_WIDTH / FOG_CELL);
const FOG_ROWS = Math.ceil(MAP_HEIGHT / FOG_CELL);
const exploredGrid = new Uint8Array(FOG_COLS * FOG_ROWS);

function fogIndex(wx: number, wy: number): number {
  const cx = Math.max(0, Math.min(FOG_COLS - 1, Math.floor(wx / FOG_CELL)));
  const cy = Math.max(0, Math.min(FOG_ROWS - 1, Math.floor(wy / FOG_CELL)));
  return cy * FOG_COLS + cx;
}

/** Stamp the ratchet buffer with a circle around the viewer. O(vision-circle
 *  area in cells) — independent of terrain/tank counts, called once/frame. */
function stampExplored(cx: number, cy: number, radius: number): void {
  const cellR = Math.ceil(radius / FOG_CELL) + 1;
  const c0x = Math.floor(cx / FOG_CELL);
  const c0y = Math.floor(cy / FOG_CELL);
  const r2 = radius * radius;
  for (let gy = -cellR; gy <= cellR; gy++) {
    const ry = c0y + gy;
    if (ry < 0 || ry >= FOG_ROWS) continue;
    for (let gx = -cellR; gx <= cellR; gx++) {
      const rx = c0x + gx;
      if (rx < 0 || rx >= FOG_COLS) continue;
      const wx = rx * FOG_CELL + FOG_CELL / 2;
      const wy = ry * FOG_CELL + FOG_CELL / 2;
      if ((wx - cx) ** 2 + (wy - cy) ** 2 <= r2) exploredGrid[ry * FOG_COLS + rx] = 1;
    }
  }
}

/** Fog alpha multiplier for a world point: 1 = currently visible, 0.12 =
 *  previously seen, 0 = never seen. */
function fogAlphaAt(wx: number, wy: number, viewerX: number, viewerY: number): number {
  if ((wx - viewerX) ** 2 + (wy - viewerY) ** 2 <= VISION_RADIUS * VISION_RADIUS) return 1;
  return exploredGrid[fogIndex(wx, wy)] ? 0.12 : 0;
}

/** Local player's position for fog/vision purposes, falling back to the
 *  camera focus while dead/unspawned so the world doesn't vanish into void. */
function resolveViewer(
  snap: GameStateSnapshot,
  yourTankId: string,
  cam: Camera,
): { x: number; y: number } {
  const t = snap.tanks.find((tk) => tk.id === yourTankId);
  if (t && !t.isDead) return { x: t.x, y: t.y };
  return { x: cam.x, y: cam.y };
}

/** Purely decorative rotating radar sweep + fading trail around the local
 *  viewer — reinforces the scope-glass read without gating any information
 *  (everything in the snapshot is already server-vision-filtered). */
function drawVisionSweep(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  viewer: { x: number; y: number },
): void {
  const p = project(cam, W, H, viewer.x, viewer.y);
  const r = VISION_RADIUS * cam.zoom;
  if (p.x < -r || p.x > W + r || p.y < -r || p.y > H + r) return;
  const angle = ((Date.now() / 1000) * (Math.PI * 2)) / 6; // one revolution / 6s
  const steps = 16;
  const span = Math.PI * 0.4;
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const a0 = angle - t * span;
    const a1 = angle - (t + 1 / steps) * span;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.arc(p.x, p.y, r, a1, a0);
    ctx.closePath();
    ctx.fillStyle = phos(0.045 * (1 - t));
    ctx.fill();
  }
  ctx.strokeStyle = phos(0.3);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r);
  ctx.stroke();
  ctx.restore();
}

// ── Terrain generation ──────────────────────────────────────────────────
const FOREST_BAKE_PX = 128;

/** Bake 3-5 overlapping soft-gradient blobs + a crisp canopy outline to an
 *  offscreen canvas ONCE. The live render path is a single drawImage call. */
function bakeForestBitmap(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = FOREST_BAKE_PX;
  c.height = FOREST_BAKE_PX;
  const bx = c.getContext("2d");
  if (!bx) return c;
  const cx = FOREST_BAKE_PX / 2;
  const cy = FOREST_BAKE_PX / 2;
  const blobCount = 3 + Math.floor(Math.random() * 3); // 3..5
  for (let i = 0; i < blobCount; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * FOREST_BAKE_PX * 0.16;
    const px = cx + Math.cos(ang) * dist;
    const py = cy + Math.sin(ang) * dist;
    const r = FOREST_BAKE_PX * 0.2 + Math.random() * FOREST_BAKE_PX * 0.12;
    const grad = bx.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, phos(0.5));
    grad.addColorStop(0.55, phos(0.2));
    grad.addColorStop(1, phos(0));
    bx.fillStyle = grad;
    bx.beginPath();
    bx.arc(px, py, r, 0, Math.PI * 2);
    bx.fill();
  }
  bx.strokeStyle = phos(0.65);
  bx.lineWidth = 1.4;
  for (let i = 0; i < blobCount; i++) {
    const ang = (i / blobCount) * Math.PI * 2 + Math.random() * 0.6;
    const dist = FOREST_BAKE_PX * (0.08 + Math.random() * 0.1);
    const px = cx + Math.cos(ang) * dist;
    const py = cy + Math.sin(ang) * dist;
    const r = FOREST_BAKE_PX * (0.14 + Math.random() * 0.06);
    bx.beginPath();
    bx.arc(px, py, r, 0, Math.PI * 2);
    bx.stroke();
  }
  return c;
}

// Precompute the stable shape jitter (and, for forest, the baked bitmap) for
// a single terrain cell.
function decorateCell(cell: TerrainCell): TerrainCell {
  if (cell.type === TerrainType.FOREST) {
    cell.bitmap = bakeForestBitmap();
  } else if (cell.type === TerrainType.ROCK) {
    cell.rockRadii = Array.from({ length: 6 }, () => 0.8 + Math.random() * 0.4);
  } else if (cell.type === TerrainType.ORE) {
    cell.oreBits = Array.from({ length: 14 }, () => ({
      ox: (Math.random() - 0.5) * 0.9,
      oy: (Math.random() - 0.5) * 0.9,
      r: 0.06 + Math.random() * 0.07,
    }));
  }
  return cell;
}

// Initialize terrain system. Features are sparse and spaced on a coarse grid
// so the arena reads as scattered cover, not a wall of overlapping blobs.
export function initTerrain(): void {
  terrain.length = 0;

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
      const jx = x + (Math.random() - 0.5) * gridStep * 0.4;
      const jy = y + (Math.random() - 0.5) * gridStep * 0.4;
      terrain.push(decorateCell({ type, x: jx, y: jy }));
    }
  }

  // A handful of solid walls/rocks as hard cover.
  for (let i = 0; i < 10; i++) {
    const type = Math.random() > 0.5 ? TerrainType.WALL : TerrainType.ROCK;
    terrain.push(
      decorateCell({ type, x: Math.random() * MAP_WIDTH, y: Math.random() * MAP_HEIGHT }),
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
    const fx = hitEffects[i];
    if (!fx) continue;
    fx.frame++;
    if (fx.frame >= fx.maxFrames) {
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

  if (terrain.length === 0) {
    initTerrain();
  }

  // Background: near-black/deep-navy void, subtle static radial gradient
  // standing in for scope glass. No scanline/vignette filter layer.
  drawBackground(ctx, W, H);

  const viewer = resolveViewer(snap, yourTankId, cam);
  stampExplored(viewer.x, viewer.y, VISION_RADIUS);

  // Battlefield persistence (under terrain and units): tread trails left by
  // moving tanks and scorch decals under kills.
  updateTreadTracks(snap);
  drawTreadTracks(ctx, cam, W, H);
  drawScorchMarks(ctx, cam, W, H);

  drawTerrain(ctx, cam, W, H, viewer);
  drawGrid(ctx, cam, W, H, viewer);
  drawVisionSweep(ctx, cam, W, H, viewer);
  drawMapBounds(ctx, cam, W, H);

  // Turn this tick's death/mine events into explosions + kill-feed lines, then
  // advance time-based HUD systems (effects expire, scoreboard reflects live
  // team counts).
  processSnapshotEvents(snap);
  updateExplosions(1 / 60);
  updateHitEffects();
  updateKillFeed();
  updateTeamScores(snap);

  // Pickups (drawn below tanks): rotating vector glyphs, neutral hue.
  for (const pk of snap.pickups) {
    drawPickup(ctx, cam, W, H, pk);
  }

  // Visible mines (own / ally / radar-detected). Rendered only once armed or
  // still-arming per this player's own visibility — the server has already
  // filtered visibleMines to what this player is allowed to see.
  for (const m of snap.visibleMines) {
    drawMine(ctx, cam, W, H, m, snap.tick);
  }

  // Projectiles: always the firing tank's team hue.
  for (const proj of snap.projectiles) {
    const owner = snap.tanks.find((t) => t.id === proj.ownerId);
    drawProjectile(ctx, cam, W, H, proj, owner ? teamHue(owner.team) : PHOSPHOR);
  }

  for (const effect of hitEffects) {
    drawHitEffect(ctx, cam, W, H, effect);
  }
  for (const ex of explosions) {
    drawExplosion(ctx, cam, W, H, ex);
  }

  if (commandTarget) {
    drawCommandTarget(ctx, cam, W, H, commandTarget);
  }

  for (const t of snap.tanks) {
    drawTank(ctx, cam, W, H, t, t.id === yourTankId);
  }

  // Screen-space HUD layers.
  drawMinimap(ctx, cam, W, H, snap, yourTankId, viewer);
  drawScoreboard(ctx, W, H);
  drawKillFeed(ctx, W, H);

  // Death overlay for the local tank, driven straight from the snapshot so it
  // renders without depending on an external call site.
  const localTank = snap.tanks.find((t) => t.id === yourTankId);
  setDeathOverlay(
    !!localTank?.isDead,
    localTank?.isDead ? Math.max(0, localTank.respawnAtTick - snap.tick) : 0,
  );
  if (deathOverlay.isDead) {
    drawDeathOverlay(ctx, W, H);
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, BG_CENTER);
  g.addColorStop(1, BG_EDGE);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Rotating vector glyph keyed to pickup function, neutral cyan-white hue,
 *  slow constant rotation + pulse, inside a thin badge ring. */
function drawPickup(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  pk: PickupState,
): void {
  const p = project(cam, W, H, pk.x, pk.y);
  const s = 10 * cam.zoom;
  if (p.x < -30 || p.x > W + 30 || p.y < -30 || p.y > H + 30) return;
  const t = Date.now() / 1000;
  const bob = Math.sin(t * 1.6 + p.x * 0.02) * 2 * cam.zoom;
  const y = p.y + bob;
  const rot = (t * 0.6) % (Math.PI * 2);
  const pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + p.x * 0.01);

  ctx.save();
  const ring = new Path2D();
  ring.arc(p.x, y, s * 1.35, 0, Math.PI * 2);
  glowStrokePath(ctx, ring, PICKUP_HUE, 1, 0.45 * pulse);

  ctx.translate(p.x, y);
  ctx.rotate(rot);
  const glyph = new Path2D();
  buildPickupGlyph(glyph, pk.type, s);
  glowStrokePath(ctx, glyph, PICKUP_HUE, 1.4, 0.9 * pulse);
  ctx.restore();
}

function buildPickupGlyph(path: Path2D, type: ItemType, s: number): void {
  switch (type) {
    case ItemType.FUEL_CRATE:
      // Bolt/can outline.
      path.moveTo(-s * 0.15, -s * 0.75);
      path.lineTo(s * 0.35, -s * 0.1);
      path.lineTo(s * 0.05, -s * 0.05);
      path.lineTo(s * 0.15, s * 0.75);
      path.lineTo(-s * 0.35, s * 0.05);
      path.lineTo(-s * 0.05, 0);
      path.closePath();
      break;
    case ItemType.MISSILE:
      // Stacked upward chevrons — ammo up.
      for (const oy of [-s * 0.35, s * 0.05, s * 0.45]) {
        path.moveTo(-s * 0.4, oy + s * 0.3);
        path.lineTo(0, oy - s * 0.1);
        path.lineTo(s * 0.4, oy + s * 0.3);
      }
      break;
    case ItemType.MINE_PACK:
      // Small spiked cluster (distinct badge from the armed-mine starburst).
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        path.moveTo(0, 0);
        path.lineTo(Math.cos(a) * s * 0.65, Math.sin(a) * s * 0.65);
      }
      break;
    case ItemType.SHIELD:
      // Hexagon outline.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * s * 0.7;
        const y = Math.sin(a) * s * 0.7;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      path.closePath();
      break;
    case ItemType.RADAR:
      // Sweep-dish: two concentric arcs + a spoke — mine-sweep motif.
      path.arc(0, 0, s * 0.7, -Math.PI * 0.6, Math.PI * 0.1);
      path.moveTo(Math.cos(-Math.PI * 0.6) * s * 0.4, Math.sin(-Math.PI * 0.6) * s * 0.4);
      path.arc(0, 0, s * 0.4, -Math.PI * 0.6, Math.PI * 0.1);
      path.moveTo(0, 0);
      path.lineTo(Math.cos(Math.PI * 0.1) * s * 0.7, Math.sin(Math.PI * 0.1) * s * 0.7);
      break;
    case ItemType.TELEPORT_CHARGE:
      // Converging warp diamonds.
      path.moveTo(0, -s * 0.75);
      path.lineTo(s * 0.55, 0);
      path.lineTo(0, s * 0.75);
      path.lineTo(-s * 0.55, 0);
      path.closePath();
      path.moveTo(0, -s * 0.35);
      path.lineTo(s * 0.3, 0);
      path.lineTo(0, s * 0.35);
      path.lineTo(-s * 0.3, 0);
      path.closePath();
      break;
    default:
      break;
  }
}

/** Mines render ONLY once armed or while still visibly arming to their owner
 *  — never before, obeying the same reveal gate as everything else (the
 *  server already filters visibleMines to what this player may see). */
function drawMine(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  m: MineState,
  currentTick: number,
): void {
  const p = project(cam, W, H, m.x, m.y);
  const r = 8 * cam.zoom;
  if (p.x < -r * 3 || p.x > W + r * 3 || p.y < -r * 3 || p.y > H + r * 3) return;
  const armed = currentTick - m.spawnTick >= MINE_ARMING_TICKS;
  const t = Date.now() / 1000;

  ctx.save();
  ctx.translate(p.x, p.y);
  if (!armed) {
    // Arming: dim phosphor pulse ring — inert, not yet a danger state.
    const pulse = 0.35 + 0.3 * Math.abs(Math.sin(t * 4));
    const ring = new Path2D();
    ring.arc(0, 0, r, 0, Math.PI * 2);
    glowStrokePath(ctx, ring, PHOSPHOR, 1, pulse);
  } else {
    // Armed: alarm-color crosshair/starburst.
    const pulse = 0.7 + 0.3 * Math.sin(t * 6);
    const star = new Path2D();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      star.moveTo(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4);
      star.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6);
    }
    glowStrokePath(ctx, star, ALARM, 1.4, pulse);
    const core = new Path2D();
    core.arc(0, 0, r * 0.35, 0, Math.PI * 2);
    glowStrokePath(ctx, core, ALARM, 1, 0.9);
  }
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
  const path = new Path2D();
  path.moveTo(p.x - s, p.y);
  path.lineTo(p.x + s, p.y);
  path.moveTo(p.x, p.y - s);
  path.lineTo(p.x, p.y + s);
  path.moveTo(p.x + s * 0.7, p.y);
  path.arc(p.x, p.y, s * 0.7, 0, Math.PI * 2);
  glowStrokePath(ctx, path, PHOSPHOR, 1.6, 0.8);
}

/** Grid ticks (not continuous lines — reads as a radar reference mesh) at
 *  each cell corner, gated by the fog-of-war buffer at cell resolution. */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  viewer: { x: number; y: number },
): void {
  const step = FOG_CELL;
  const startX = Math.floor((cam.x - W / (2 * cam.zoom)) / step) * step;
  const startY = Math.floor((cam.y - H / (2 * cam.zoom)) / step) * step;
  const endX = cam.x + W / (2 * cam.zoom);
  const endY = cam.y + H / (2 * cam.zoom);
  const tick = 3 * cam.zoom;

  ctx.save();
  ctx.lineWidth = 1;
  for (let x = startX; x < endX; x += step) {
    for (let y = startY; y < endY; y += step) {
      const a = fogAlphaAt(x + step / 2, y + step / 2, viewer.x, viewer.y);
      if (a <= 0) continue;
      const p = project(cam, W, H, x, y);
      ctx.strokeStyle = phos(0.3 * a);
      ctx.beginPath();
      ctx.moveTo(p.x - tick, p.y);
      ctx.lineTo(p.x + tick, p.y);
      ctx.moveTo(p.x, p.y - tick);
      ctx.lineTo(p.x, p.y + tick);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMapBounds(ctx: CanvasRenderingContext2D, cam: Camera, W: number, H: number): void {
  const tl = project(cam, W, H, 0, 0);
  const br = project(cam, W, H, MAP_WIDTH, MAP_HEIGHT);
  const path = new Path2D();
  path.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  glowStrokePath(ctx, path, PHOSPHOR, 1.5, 0.5);
}

function drawTerrain(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  viewer: { x: number; y: number },
): void {
  const size = 72 * cam.zoom;
  const tSec = Date.now() / 1000;
  for (const t of terrain) {
    const p = project(cam, W, H, t.x, t.y);
    if (p.x < -size || p.x > W + size || p.y < -size || p.y > H + size) continue;

    const fogA = fogAlphaAt(t.x, t.y, viewer.x, viewer.y);
    if (fogA <= 0) continue;

    ctx.save();
    if (t.type === TerrainType.WALL) {
      drawWall(ctx, p, size, fogA);
    } else if (t.type === TerrainType.WATER) {
      drawWater(ctx, p, size, fogA);
    } else if (t.type === TerrainType.FOREST && t.bitmap) {
      ctx.globalAlpha = fogA;
      ctx.drawImage(t.bitmap, p.x - size / 2, p.y - size / 2, size, size);
    } else if (t.type === TerrainType.ORE) {
      drawOre(ctx, p, size, t.oreBits ?? [], fogA, tSec);
    } else if (t.type === TerrainType.ROCK) {
      drawRock(ctx, p, size, t.rockRadii ?? [1, 1, 1, 1, 1, 1], fogA);
    }
    ctx.restore();
  }
}

/** The ONE solid filled shape in the entire language: desaturated/darker
 *  phosphor fill + brighter rim-glow edge stroke. This binary is never
 *  broken elsewhere. */
function drawWall(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  size: number,
  fogA: number,
): void {
  const s = size;
  ctx.globalAlpha = fogA;
  ctx.fillStyle = "rgb(22,42,34)";
  ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  ctx.globalAlpha = 1;
  const rim = new Path2D();
  rim.rect(p.x - s / 2, p.y - s / 2, s, s);
  glowStrokePath(ctx, rim, PHOSPHOR, 1.3, 0.75 * fogA);
}

function drawWater(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  size: number,
  fogA: number,
): void {
  const r = size / 2;
  ctx.globalAlpha = fogA;
  ctx.fillStyle = phos(0.08);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const ring1 = new Path2D();
  ring1.arc(p.x, p.y, r * 0.92, 0, Math.PI * 2);
  glowStrokePath(ctx, ring1, PHOSPHOR, 1, 0.35 * fogA);
  const ring2 = new Path2D();
  ring2.arc(p.x, p.y, r * 0.52, 0, Math.PI * 2);
  glowStrokePath(ctx, ring2, PHOSPHOR, 0.8, 0.28 * fogA);
}

function drawOre(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  size: number,
  bits: Array<{ ox: number; oy: number; r: number }>,
  fogA: number,
  tSec: number,
): void {
  const pulse = 0.75 + 0.25 * Math.sin(tSec * 1.3 + p.x * 0.01);
  ctx.globalAlpha = fogA * pulse;
  ctx.fillStyle = phos(0.6);
  for (const bit of bits) {
    const bx = p.x + bit.ox * size;
    const by = p.y + bit.oy * size;
    const r = bit.r * size;
    ctx.beginPath();
    ctx.moveTo(bx, by - r);
    ctx.lineTo(bx + r, by);
    ctx.lineTo(bx, by + r);
    ctx.lineTo(bx - r, by);
    ctx.closePath();
    ctx.fill();
  }
}

/** Rock = jittered polygon, stroke-only (never baked — the brief only asks
 *  forest to be pre-baked; a handful of live rocks is negligible cost). */
function drawRock(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  size: number,
  radii: number[],
  fogA: number,
): void {
  ctx.globalAlpha = 1;
  const path = new Path2D();
  for (let i = 0; i < radii.length; i++) {
    const angle = (i / radii.length) * Math.PI * 2;
    const r = (size / 2) * radii[i]!;
    const x = p.x + Math.cos(angle) * r;
    const y = p.y + Math.sin(angle) * r;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  glowStrokePath(ctx, path, PHOSPHOR, 1.3, 0.6 * fogA);
}

// ── Tank weight-class hull silhouettes ─────────────────────────────────────
type WeightClass = "light" | "medium" | "heavy";

/** 5/6/7-point open hull profiles, as fractions of TANK_RADIUS, forward=+x.
 *  Chosen for a clear tapered nose at every rotation so heading always reads
 *  at a glance. */
const HULL_TEMPLATES: Record<WeightClass, ReadonlyArray<readonly [number, number]>> = {
  light: [
    [1.3, 0],
    [0.4, -0.6],
    [-1.0, -0.55],
    [-1.0, 0.55],
    [0.4, 0.6],
  ],
  medium: [
    [1.15, 0],
    [0.5, -0.7],
    [-0.85, -0.7],
    [-1.15, 0],
    [-0.85, 0.7],
    [0.5, 0.7],
  ],
  heavy: [
    [1.0, 0],
    [0.65, -0.5],
    [0.1, -0.9],
    [-0.75, -0.85],
    [-1.15, -0.35],
    [-1.15, 0.35],
    [-0.5, 0.85],
  ],
};

function weightClassForTier(tier: number): WeightClass {
  return tier <= 1 ? "light" : tier <= 3 ? "medium" : "heavy";
}

function buildHullPath(cls: WeightClass, r: number): Path2D {
  const pts = HULL_TEMPLATES[cls];
  const path = new Path2D();
  for (let i = 0; i < pts.length; i++) {
    const [fx, fy] = pts[i]!;
    const x = fx * r;
    const y = fy * r;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

/** Kill-notch / campaign-ribbon motif (graft from "The Counter Sheet"): a row
 *  of small glowing vector chevrons, filled cumulatively. `litCount` may be
 *  fractional — the currently-filling notch renders a left-to-right partial
 *  reveal. */
function drawNotchRow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
  litCount: number,
  triple: string,
  notchW: number,
  notchH: number,
  gap: number,
): void {
  for (let i = 0; i < count; i++) {
    const nx = x + i * (notchW + gap);
    const chevron = new Path2D();
    chevron.moveTo(nx, y - notchH / 2);
    chevron.lineTo(nx + notchW * 0.6, y);
    chevron.lineTo(nx, y + notchH / 2);

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 1;
    ctx.strokeStyle = phos(0.16);
    ctx.stroke(chevron);

    const fill = Math.max(0, Math.min(1, litCount - i));
    if (fill <= 0) continue;
    ctx.save();
    if (fill < 1) {
      ctx.beginPath();
      ctx.rect(nx - 2, y - notchH, notchW * fill + 2, notchH * 2);
      ctx.clip();
    }
    glowStrokePath(ctx, chevron, triple, 1.5, 0.9);
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
  if (p.x < -r * 4 || p.x > W + r * 4 || p.y < -r * 4 || p.y > H + r * 4) return;
  const hue = teamHue(t.team);
  const tier = t.powerTier ?? 0;
  const now = Date.now() / 1000;

  ctx.save();

  // Combat-tier aura: team-hued always (never a new hue) — tier controls
  // only intensity/radius/pulse, not color.
  if (tier > 0 && !t.isDead) {
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now * 1.4 + t.x * 0.005));
    const ring = new Path2D();
    ring.arc(p.x, p.y, r + 10 + tier * 3, 0, Math.PI * 2);
    glowStrokePath(ctx, ring, hue, 1 + tier * 0.3, 0.12 + tier * 0.05 + pulse * 0.1);
  }

  // Spawn protection: bright dashed phosphor ring — a neutral status, not a
  // team or danger signal.
  if (t.isSpawnProtected) {
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -(now * 40) % 9;
    ctx.strokeStyle = phos(0.7);
    ctx.lineWidth = 1.6 * cam.zoom;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Shield: team-hued hex energy shell.
  if (t.hasShield) {
    const hexR = r + 9;
    const hex = new Path2D();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = p.x + Math.cos(a) * hexR;
      const y = p.y + Math.sin(a) * hexR;
      if (i === 0) hex.moveTo(x, y);
      else hex.lineTo(x, y);
    }
    hex.closePath();
    ctx.fillStyle = rgba(hue, 0.08);
    ctx.fill(hex);
    glowStrokePath(ctx, hex, hue, 1.4, 0.6);
  }

  // Hull: weight-class open polygon (5/7/7-pt), filled low-alpha team tint +
  // bright glow-stroked outline.
  {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(t.angle);
    const cls = weightClassForTier(tier);
    const hull = buildHullPath(cls, r);
    ctx.fillStyle = t.isDead ? "rgba(90,100,96,0.06)" : rgba(hue, 0.07);
    ctx.fill(hull);
    glowStrokePath(ctx, hull, t.isDead ? "110,120,116" : hue, 1.4, t.isDead ? 0.3 : 0.9);
    // Tread rails: two short crisp lines on the hull sides.
    ctx.strokeStyle = t.isDead ? "rgba(110,120,116,0.4)" : rgba(hue, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, -r * 0.72);
    ctx.lineTo(-r * 0.95, r * 0.72);
    ctx.moveTo(r * 0.5, -r * 0.78);
    ctx.lineTo(r * 0.5, r * 0.78);
    ctx.stroke();
    ctx.restore();
  }

  // Turret: 2-3 stop radial-gradient core + a 1-2px barrel stroke, rotated
  // independently to the (absolute) turret aim angle.
  if (!t.isDead) {
    const tg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 0.5);
    tg.addColorStop(0, "rgba(255,255,255,0.9)");
    tg.addColorStop(0.45, rgba(hue, 0.65));
    tg.addColorStop(1, rgba(hue, 0));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();

    const barrel = new Path2D();
    barrel.moveTo(p.x + Math.cos(t.turretAngle) * r * 0.3, p.y + Math.sin(t.turretAngle) * r * 0.3);
    barrel.lineTo(p.x + Math.cos(t.turretAngle) * r * 1.6, p.y + Math.sin(t.turretAngle) * r * 1.6);
    glowStrokePath(ctx, barrel, hue, 1.4, 0.85);
  }

  // Battle damage: dim smoke wisps once fuel (=health) runs low, alarm-color
  // flicker when critical. Reads at a glance as target-selection info.
  const healthPct = t.fuel / MAX_FUEL;
  if (!t.isDead && healthPct < 0.35) {
    const seed = (t.x * 13.37 + t.y * 7.77) % 10;
    for (let i = 0; i < 3; i++) {
      const phase = (now * 0.8 + i / 3 + seed) % 1;
      const sx = p.x + Math.sin((now + i * 2.1 + seed) * 2.3) * 4 * cam.zoom;
      const sy = p.y - r * 0.4 - phase * 26 * cam.zoom;
      ctx.globalAlpha = (1 - phase) * (healthPct < 0.15 ? 0.45 : 0.28);
      ctx.fillStyle = healthPct < 0.15 ? "rgba(90,55,48,1)" : "rgba(150,160,155,1)";
      ctx.beginPath();
      ctx.arc(sx, sy, (3 + phase * 7) * cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (healthPct < 0.15) {
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now * 17 + seed);
      ctx.fillStyle = alarmC(1);
      ctx.beginPath();
      ctx.arc(p.x, p.y - r * 0.3, 3.2 * cam.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Local-tank marker: bright pulsing phosphor ring, distinct from team hue.
  if (isLocal) {
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(now * 3));
    const ring = new Path2D();
    ring.arc(p.x, p.y, r + 11, 0, Math.PI * 2);
    glowStrokePath(ctx, ring, PHOSPHOR, 1.4, pulse);
  }

  // Name label: neutral phosphor monospace, legible regardless of team hue.
  ctx.font = `${Math.max(10, 11 * cam.zoom)}px "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.fillStyle = phos(0.92);
  ctx.fillText(t.name, p.x, p.y - r - 22);

  // Fuel ring (Diorama Command graft): a draining ring around the hull,
  // hue-interpolated base-phosphor → alarm as fuel depletes. Armor: 4
  // directional arcs just inside it, using the SAME hue-interpolation law
  // per-facing — one shared brightness/hue-meaning language, not two.
  if (!t.isDead) {
    drawFuelRing(ctx, p, r, healthPct);
    drawArmorRing(ctx, p, r, t);
  }

  ctx.restore();
}

function drawFuelRing(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  r: number,
  pct: number,
): void {
  const ringR = r + 6;
  const gap = 0.12;
  const start = -Math.PI / 2 + gap / 2;
  const sweep = Math.PI * 2 - gap;
  const track = new Path2D();
  track.arc(p.x, p.y, ringR, start, start + sweep);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = phos(0.12);
  ctx.stroke(track);

  const clamped = Math.max(0, Math.min(1, pct));
  const filled = new Path2D();
  filled.arc(p.x, p.y, ringR, start, start + sweep * clamped);
  const alpha = pct <= 0.2 ? 0.65 + 0.35 * Math.abs(Math.sin(Date.now() / 180)) : 0.85;
  glowStrokePath(ctx, filled, healthColor(pct), 2.2, alpha);
}

function drawArmorRing(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  r: number,
  t: TankState,
): void {
  const ringR = r + 2.5;
  const gap = 0.16;
  const segments: Array<{ center: number; half: number; pct: number }> = [
    { center: 0, half: Math.PI * 0.28, pct: t.armor.front / 100 },
    { center: Math.PI, half: Math.PI * 0.22, pct: t.armor.rear / 100 },
    { center: -Math.PI / 2, half: Math.PI * 0.2, pct: t.armor.side / 100 },
    { center: Math.PI / 2, half: Math.PI * 0.2, pct: t.armor.side / 100 },
  ];
  ctx.lineCap = "butt";
  for (const seg of segments) {
    const a0 = t.angle + seg.center - seg.half + gap / 2;
    const a1 = t.angle + seg.center + seg.half - gap / 2;
    const track = new Path2D();
    track.arc(p.x, p.y, ringR, a0, a1);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = phos(0.1);
    ctx.stroke(track);

    const pctClamped = Math.max(0, Math.min(1, seg.pct));
    const filled = new Path2D();
    filled.arc(p.x, p.y, ringR, a0, a0 + (a1 - a0) * pctClamped);
    ctx.strokeStyle = rgba(healthColor(seg.pct), 0.85);
    ctx.stroke(filled);
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
  const a = 1 - progress;
  const z = cam.zoom;
  const baseR =
    effect.type === HitEffectType.MINE ? 22 : effect.type === HitEffectType.MISSILE ? 16 : 10;
  const r = baseR * z * (0.6 + progress * 0.8);
  const spikes = effect.type === HitEffectType.MINE ? 10 : 6;

  const star = new Path2D();
  for (let i = 0; i < spikes; i++) {
    const ang = (i / spikes) * Math.PI * 2;
    star.moveTo(p.x + Math.cos(ang) * r * 0.3, p.y + Math.sin(ang) * r * 0.3);
    star.lineTo(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r);
  }
  glowStrokePath(ctx, star, ALARM, effect.type === HitEffectType.MINE ? 2 : 1.4, a);
}

/** First-sight registry for muzzle flashes. Keyed on projectile id; the first
 *  rendered position of a projectile ≈ its muzzle position (it enters the
 *  interpolation buffer at its spawn snapshot), and wall-clock timing sidesteps
 *  the interpolator's tick lag. */
const seenProjectiles = new Map<string, { born: number; ox: number; oy: number }>();
const MUZZLE_FLASH_MS = 130;

function drawProjectile(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  p: ProjectileState,
  hue: string,
): void {
  const sp = project(cam, W, H, p.x, p.y);
  ctx.save();

  const now = Date.now();
  let seen = seenProjectiles.get(p.id);
  if (!seen) {
    seen = { born: now, ox: p.x, oy: p.y };
    seenProjectiles.set(p.id, seen);
    if (seenProjectiles.size > 128) {
      for (const [id, s] of seenProjectiles) {
        if (now - s.born > 1000) seenProjectiles.delete(id);
      }
    }
  }
  const flashAge = now - seen.born;
  if (flashAge < MUZZLE_FLASH_MS) {
    const mp = project(cam, W, H, seen.ox, seen.oy);
    const fade = 1 - flashAge / MUZZLE_FLASH_MS;
    const fr = (p.kind === ProjectileKind.MISSILE ? 16 : 10) * cam.zoom;
    const fg = ctx.createRadialGradient(mp.x, mp.y, 0, mp.x, mp.y, fr);
    fg.addColorStop(0, `rgba(255,255,255,${(0.95 * fade).toFixed(3)})`);
    fg.addColorStop(0.4, rgba(hue, 0.7 * fade));
    fg.addColorStop(1, rgba(hue, 0));
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(mp.x, mp.y, fr, 0, Math.PI * 2);
    ctx.fill();
  }

  const speed = Math.hypot(p.vx, p.vy) || 1;
  const angle = Math.atan2(p.vy, p.vx);

  if (p.kind === ProjectileKind.BULLET) {
    const trailLen = 22 * cam.zoom;
    const tx = sp.x - (p.vx / speed) * trailLen;
    const ty = sp.y - (p.vy / speed) * trailLen;
    const lg = ctx.createLinearGradient(sp.x, sp.y, tx, ty);
    lg.addColorStop(0, rgba(hue, 0.8));
    lg.addColorStop(1, rgba(hue, 0));
    ctx.strokeStyle = lg;
    ctx.lineWidth = 2 * cam.zoom;
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    const core = new Path2D();
    core.arc(sp.x, sp.y, 2.6 * cam.zoom, 0, Math.PI * 2);
    glowStrokePath(ctx, core, hue, 1.3, 1);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 1.2 * cam.zoom, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.translate(sp.x, sp.y);
    ctx.rotate(angle);
    const body = new Path2D();
    body.moveTo(8 * cam.zoom, 0);
    body.lineTo(-4 * cam.zoom, -3.5 * cam.zoom);
    body.lineTo(-1 * cam.zoom, 0);
    body.lineTo(-4 * cam.zoom, 3.5 * cam.zoom);
    body.closePath();
    glowStrokePath(ctx, body, hue, 1.5, 1);

    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -(now / 20) % 8;
    ctx.strokeStyle = rgba(hue, 0.5);
    ctx.lineWidth = 2 * cam.zoom;
    ctx.beginPath();
    ctx.moveTo(-4 * cam.zoom, 0);
    ctx.lineTo(-18 * cam.zoom, 0);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function countUniqueTeams(tanks: TankState[]): number {
  let uniqueTeams = 0;
  let seenRed = false;
  let seenBlue = false;
  let seenOrange = false;
  let seenPurple = false;

  for (let i = 0; i < tanks.length; i++) {
    const team = tanks[i]?.team;
    if (team === TeamColor.RED) {
      if (!seenRed) {
        seenRed = true;
        uniqueTeams++;
      }
    } else if (team === TeamColor.BLUE) {
      if (!seenBlue) {
        seenBlue = true;
        uniqueTeams++;
      }
    } else if (team === TeamColor.ORANGE) {
      if (!seenOrange) {
        seenOrange = true;
        uniqueTeams++;
      }
    } else if (team === TeamColor.PURPLE) {
      if (!seenPurple) {
        seenPurple = true;
        uniqueTeams++;
      }
    }
    if (uniqueTeams === 4) break;
  }
  return uniqueTeams;
}

/** HUD panel chrome: a translucent scrim (for text legibility over a live
 *  battlefield) plus thin phosphor corner brackets — never a solid steel
 *  panel. Built from the identical stroke+glow primitives as the
 *  battlefield. */
function drawHudFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = "rgba(2,7,6,0.55)";
  ctx.fillRect(x, y, w, h);
  const c = Math.min(14, w * 0.12, h * 0.12);
  const path = new Path2D();
  path.moveTo(x, y + c);
  path.lineTo(x, y);
  path.lineTo(x + c, y);
  path.moveTo(x + w - c, y);
  path.lineTo(x + w, y);
  path.lineTo(x + w, y + c);
  path.moveTo(x + w, y + h - c);
  path.lineTo(x + w, y + h);
  path.lineTo(x + w - c, y + h);
  path.moveTo(x + c, y + h);
  path.lineTo(x, y + h);
  path.lineTo(x, y + h - c);
  glowStrokePath(ctx, path, PHOSPHOR, 1.2, 0.5);
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  W: number,
  H: number,
  snap: GameStateSnapshot,
  yourTankId: string,
  viewer: { x: number; y: number },
): void {
  const minimapX = W - MINIMAP_SIZE - 8;
  const minimapY = 8;

  ctx.save();
  drawHudFrame(ctx, minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);
  ctx.save();
  ctx.beginPath();
  ctx.rect(minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);
  ctx.clip();

  // Terrain, gated by the same explored buffer as the battlefield (a
  // minimap should only show what this player has actually scouted).
  for (const terrainCell of terrain) {
    if (terrainCell.type === TerrainType.EMPTY) continue;
    const fogA = fogAlphaAt(terrainCell.x, terrainCell.y, viewer.x, viewer.y);
    if (fogA <= 0) continue;
    const x = minimapX + (terrainCell.x / MAP_WIDTH) * MINIMAP_SIZE;
    const y = minimapY + (terrainCell.y / MAP_HEIGHT) * MINIMAP_SIZE;
    ctx.globalAlpha = 0.4 + 0.6 * fogA;
    ctx.fillStyle = phos(0.7);
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  // Rotating sweep line for radar flavor.
  const cxp = minimapX + MINIMAP_SIZE / 2;
  const cyp = minimapY + MINIMAP_SIZE / 2;
  const sweepA = ((Date.now() / 1000) * (Math.PI * 2)) / 4;
  ctx.strokeStyle = phos(0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cxp, cyp);
  ctx.lineTo(
    cxp + Math.cos(sweepA) * MINIMAP_SIZE * 0.5,
    cyp + Math.sin(sweepA) * MINIMAP_SIZE * 0.5,
  );
  ctx.stroke();

  for (const m of snap.visibleMines) {
    const x = minimapX + (m.x / MAP_WIDTH) * MINIMAP_SIZE;
    const y = minimapY + (m.y / MAP_HEIGHT) * MINIMAP_SIZE;
    ctx.fillStyle = alarmC(0.85);
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const pk of snap.pickups) {
    const x = minimapX + (pk.x / MAP_WIDTH) * MINIMAP_SIZE;
    const y = minimapY + (pk.y / MAP_HEIGHT) * MINIMAP_SIZE;
    ctx.fillStyle = rgba(PICKUP_HUE, 0.8);
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const t of snap.tanks) {
    const x = minimapX + (t.x / MAP_WIDTH) * MINIMAP_SIZE;
    const y = minimapY + (t.y / MAP_HEIGHT) * MINIMAP_SIZE;
    const isYou = t.id === yourTankId;
    const size = isYou ? 3.2 : 2;
    ctx.fillStyle = isYou ? phos(1) : rgba(teamHue(t.team), 0.9);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    if (t.angle !== undefined) {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(t.angle) * size * 2, y + Math.sin(t.angle) * size * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.restore();
}

/** HUD overlay: fuel gauge, rank ladder, ammo, RTT, score line. */
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

  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  const compact = W / dpr < 560 || isTouchDevice();

  ctx.save();
  ctx.font = '12px "Courier New", monospace';
  ctx.textAlign = "left";

  if (!compact) {
    ctx.fillStyle = phos(0.6);
    ctx.fillText(`srv tick=${state.serverTick}  rtt=${state.rttMs}ms  ws=${state.status}`, 8, 16);
    if (state.snap) {
      ctx.fillStyle = phos(0.45);
      ctx.fillText(
        `Tanks: ${state.snap.tanks.length} | Pickups: ${state.snap.pickups.length} | Mines: ${state.snap.visibleMines.length}`,
        8,
        34,
      );
      ctx.fillText(
        `Projectiles: ${state.snap.projectiles.length} | Teams: ${countUniqueTeams(state.snap.tanks)}`,
        8,
        52,
      );
    }
  }

  if (state.yourTank) {
    const t = state.yourTank;
    const barW = compact ? 210 : 244;
    const bx = 12;
    const panelX = bx - 8;
    const panelY = H - 172;
    const panelW = barW + 16;
    const panelH = 160;
    drawHudFrame(ctx, panelX, panelY, panelW, panelH);

    let cursorY = panelY + 20;

    // Fuel gauge — hue-interpolated bar, mirroring the in-world ring.
    const pct = Math.max(0, Math.min(1, t.fuel / MAX_FUEL));
    const barH = 12;
    const fuelHue = healthColor(pct);
    ctx.fillStyle = phos(0.08);
    ctx.fillRect(bx, cursorY, barW, barH);
    ctx.fillStyle = rgba(fuelHue, 0.85);
    ctx.fillRect(bx, cursorY, barW * pct, barH);
    const border = new Path2D();
    border.rect(bx, cursorY, barW, barH);
    glowStrokePath(ctx, border, PHOSPHOR, 1, 0.35);
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = "left";
    ctx.fillStyle = pct <= 0.2 ? alarmC(0.95) : phos(0.85);
    const fuelLabel =
      pct <= 0.05
        ? `LOW FUEL! FUEL ${Math.round(t.fuel)}/${MAX_FUEL}`
        : `FUEL ${Math.round(t.fuel)}/${MAX_FUEL}`;
    ctx.fillText(fuelLabel, bx, cursorY - 4);
    cursorY += barH + 20;

    // Rank ladder (graft from "The Counter Sheet"): campaign-ribbon chevrons,
    // lit cumulatively per military rank tier.
    const rankIdx = RANK_ORDER.indexOf(t.rank);
    ctx.fillStyle = phos(0.85);
    ctx.font = '11px "Courier New", monospace';
    ctx.fillText(`RANK  ${t.rank}`, bx, cursorY);
    cursorY += 12;
    const rankNotchW = Math.min(16, (barW - 8) / RANK_ORDER.length - 3);
    drawNotchRow(ctx, bx, cursorY, RANK_ORDER.length, rankIdx + 1, PHOSPHOR, rankNotchW, 10, 3);
    cursorY += 20;

    // Power tier ladder: same notch motif, player's own team hue, with the
    // in-progress notch fractionally filled from live kill progress.
    const tier = t.powerTier ?? 0;
    const kills = t.kills ?? 0;
    const tierLabel = tier > 0 ? (POWER_TIER_LABELS[tier] ?? "") : "—";
    ctx.fillStyle = phos(0.85);
    ctx.fillText(`TIER  ${tierLabel}`, bx, cursorY);
    cursorY += 12;
    const tierNotchW = Math.min(20, (barW - 8) / 5 - 4);
    drawNotchRow(
      ctx,
      bx,
      cursorY,
      5,
      tierProgress(tier, kills),
      teamHue(t.team),
      tierNotchW,
      11,
      4,
    );
    cursorY += 22;

    // Ammo readout — alarm when a resource is depleted.
    ctx.font = '12px "Courier New", monospace';
    const ammoParts: Array<[string, number]> = [
      ["MIS", t.ammo.missiles],
      ["MINE", t.ammo.mines],
      ["TP", t.ammo.teleports],
      ["SH", t.ammo.shields],
      ["RAD", t.ammo.radar],
    ];
    let ax = bx;
    for (const [label, count] of ammoParts) {
      ctx.fillStyle = count > 0 ? phos(0.85) : alarmC(0.85);
      const text = `${label} ${count}`;
      ctx.fillText(text, ax, cursorY);
      ax += ctx.measureText(text).width + 14;
    }

    // Centered low-fuel warning (alive only, alarm state).
    if (!t.isDead && pct > 0 && pct <= 0.3) {
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 300));
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = `bold ${Math.round(W / 42)}px "Courier New", monospace`;
      ctx.fillStyle = alarmC(pulse);
      ctx.fillText("⚠ LOW FUEL — drive over a supply crate", W / 2, H * 0.16);
      ctx.restore();
    }

    if (state.snap) {
      const visible = state.snap.tanks.length;
      ctx.save();
      ctx.textAlign = "right";
      ctx.fillStyle = phos(0.6);
      ctx.font = '12px "Courier New", monospace';
      ctx.fillText(W < 800 ? `${visible} tanks` : `visible tanks: ${visible}`, W - 8, H - 8);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = phos(0.85);
    ctx.fillText("Waiting for spawn…", 8, H - 8);
  }

  ctx.restore();

  if (!compact) {
    ctx.save();
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = phos(0.5);
    ctx.textAlign = "right";
    ctx.fillText(
      `LMB enemy=fire / ground=move (Alt=force move · Ctrl=force fire) · Space fire · RMB/K missile −${FUEL_FIRE_MISSILE} · M mine −${FUEL_MINE} · R radar −${FUEL_RADAR_SCAN} · T teleport −${FUEL_TELEPORT} · F deposit fuel · Shift shield −${FUEL_SHIELD_PER_SEC}/s · X stop`,
      W - 8,
      16,
    );
    ctx.restore();
  }

  if (state.yourTank && !coachSeen) {
    if (coachStartMs === null) coachStartMs = Date.now();
    const elapsed = Date.now() - coachStartMs;
    if (elapsed >= COACH_DURATION_MS) {
      markCoachSeen();
    } else {
      drawCoachmark(ctx, W, H, elapsed);
    }
  }

  // Survival mode: wave status strip + end-of-run panel (drawn last = on top).
  if (state.snap?.survival) {
    drawSurvivalHud(ctx, state.snap.survival, W, H);
  }
}

/** Survival wave strip (top-center) and the game-over panel. */
function drawSurvivalHud(
  ctx: CanvasRenderingContext2D,
  sv: SurvivalHudState,
  W: number,
  H: number,
): void {
  ctx.save();
  ctx.textAlign = "center";

  if (sv.phase !== "over") {
    const fs = Math.max(14, Math.round(W / 56));
    ctx.font = `bold ${fs}px 'Courier New', monospace`;
    let text: string;
    if (sv.phase === "active") {
      text = `WAVE ${sv.wave} — ${sv.enemiesLeft} HOSTILE${sv.enemiesLeft === 1 ? "" : "S"}`;
      ctx.fillStyle = RA.amber;
    } else {
      const secs = Math.ceil(sv.nextWaveInTicks / SERVER_TICK_RATE);
      text = sv.wave === 0 ? `FIRST WAVE IN ${secs}` : `WAVE ${sv.wave} CLEAR — NEXT IN ${secs}`;
      // Pulse while the clock runs so the lull reads as "get ready", not idle.
      ctx.fillStyle = RA.amber;
      ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(Date.now() / 350));
    }
    const y = Math.round(H * 0.08);
    const w = ctx.measureText(text).width;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = RA.steel;
    ctx.fillRect(W / 2 - w / 2 - 14, y - fs - 6, w + 28, fs + 16);
    ctx.strokeStyle = RA.steelEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - w / 2 - 14, y - fs - 6, w + 28, fs + 16);
    ctx.restore();
    ctx.fillText(text, W / 2, y);
    ctx.restore();
    return;
  }

  // Game over: full-screen RA-style debrief.
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000000b8";
  ctx.fillRect(0, 0, W, H);
  const big = Math.max(26, Math.round(W / 24));
  ctx.font = `bold ${big}px 'Courier New', monospace`;
  ctx.fillStyle = "#ef4444";
  ctx.fillText("TANK DESTROYED", W / 2, H * 0.4);
  ctx.font = `bold ${Math.round(big * 0.55)}px 'Courier New', monospace`;
  ctx.fillStyle = RA.amber;
  ctx.fillText(`Reached wave ${sv.waveReached}`, W / 2, H * 0.4 + big * 1.1);
  ctx.font = `${Math.round(big * 0.4)}px 'Courier New', monospace`;
  ctx.fillStyle = RA.amberDim;
  const blink = Math.floor(Date.now() / 600) % 2 === 0;
  if (blink) ctx.fillText("press R or tap to redeploy", W / 2, H * 0.4 + big * 2.0);
  ctx.restore();
}

/** Progress (0..5, fractional) along the power-tier notch row for the
 *  currently-filling notch, from live kill count vs. the next threshold. */
function tierProgress(tier: number, kills: number): number {
  const clampedTier = Math.max(0, Math.min(5, tier));
  if (clampedTier >= 5) return 5;
  const cur = POWER_TIER_THRESHOLDS[clampedTier] ?? 0;
  const next = POWER_TIER_THRESHOLDS[clampedTier + 1];
  if (next == null || next <= cur) return clampedTier + 1;
  const frac = Math.max(0, Math.min(1, (kills - cur) / (next - cur)));
  return clampedTier + frac;
}

/** Bottom-center teaching panel for first-time players. */
function drawCoachmark(ctx: CanvasRenderingContext2D, W: number, H: number, elapsed: number): void {
  const fadeIn = Math.min(1, elapsed / 400);
  const fadeOut = Math.min(1, (COACH_DURATION_MS - elapsed) / 1500);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
  if (alpha <= 0) return;

  const lines = [
    "NEW HERE?  Fuel is your health.",
    "• Click empty ground to MOVE — click an enemy to FIRE",
    "• Hold Alt = force move   ·   hold Ctrl = force fire",
    "• Drive over supply crates to refuel · grab loot for ammo",
    "(this tip won't show again)",
  ];
  const fs = Math.max(12, Math.round(W / 70));
  const pad = fs;
  const lineH = fs * 1.5;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${fs}px "Courier New", monospace`;
  ctx.textAlign = "left";
  let wmax = 0;
  for (const line of lines) wmax = Math.max(wmax, ctx.measureText(line).width);
  const boxW = wmax + pad * 2;
  const boxH = lineH * lines.length + pad;
  const x = (W - boxW) / 2;
  const y = H - boxH - Math.round(H * 0.17);

  drawHudFrame(ctx, x, y, boxW, boxH);

  let ty = y + pad + fs * 0.4;
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? phos(1) : i === lines.length - 1 ? phos(0.4) : phos(0.85);
    ctx.fillText(line, x + pad, ty);
    ty += lineH;
  });
  ctx.restore();
}

function addKillFeed(text: string): void {
  const now = Date.now();
  killFeed.push({ text, time: now });
  if (killFeed.length > KILL_FEED_MAX_ITEMS) {
    killFeed.shift();
  }
}

function updateKillFeed(): void {
  const now = Date.now();
  for (let i = killFeed.length - 1; i >= 0; i--) {
    const entry = killFeed[i];
    if (entry && now - entry.time > 3000) {
      killFeed.splice(i, 1);
    }
  }
}

function drawKillFeed(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.save();
  const startX = W / 2;
  const startY = 80;
  const lineHeight = 20;

  ctx.font = '14px "Courier New", monospace';
  ctx.textAlign = "center";

  for (let i = 0; i < killFeed.length; i++) {
    const item = killFeed[i];
    if (!item) continue;
    const alpha = Math.min(1, (Date.now() - item.time) / 1000);
    const y = startY + i * lineHeight;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = phos(0.9);
    ctx.fillText(item.text, startX, y);
    ctx.restore();
  }
  ctx.restore();
}

function updateTeamScores(snap: GameStateSnapshot): void {
  teamScores = {
    [TeamColor.RED]: 0,
    [TeamColor.BLUE]: 0,
    [TeamColor.ORANGE]: 0,
    [TeamColor.PURPLE]: 0,
  };
  for (const tank of snap.tanks) {
    if (tank.team && !tank.isDead) {
      teamScores[tank.team] = (teamScores[tank.team] || 0) + 1;
    }
  }
}

function drawScoreboard(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const x = 8;
  const y = 60;
  const w = 148;
  const h = 78;
  ctx.save();
  drawHudFrame(ctx, x, y, w, h);
  ctx.font = '12px "Courier New", monospace';
  ctx.textAlign = "left";
  let yOffset = 16;
  for (const team of [TeamColor.RED, TeamColor.BLUE, TeamColor.ORANGE, TeamColor.PURPLE]) {
    const count = teamScores[team] || 0;
    const hue = teamHue(team);
    ctx.fillStyle = rgba(hue, 0.35);
    ctx.beginPath();
    ctx.arc(x + 10, y + yOffset - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(hue, 0.95);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = phos(0.85);
    ctx.fillText(`${team}: ${count}`, x + 20, y + yOffset);
    yOffset += 17;
  }
  ctx.restore();
}

function drawDeathOverlay(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.save();
  ctx.globalAlpha = deathOverlay.opacity;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.fillStyle = alarmC(0.95);
  ctx.font = 'bold 42px "Courier New", monospace';
  ctx.fillText("DEACTIVATED", W / 2, H / 2 - 10);
  if (deathOverlay.respawnTimer > 0) {
    ctx.fillStyle = phos(0.85);
    ctx.font = '18px "Courier New", monospace';
    ctx.fillText(
      `Respawning in ${Math.ceil(deathOverlay.respawnTimer / SERVER_TICK_RATE)}…`,
      W / 2,
      H / 2 + 28,
    );
  }
  ctx.restore();
}

/** Desktop cursor reticle. Color encodes what a left-click will do: alarm =
 *  fire, pickup-neutral = roll over equipment, phosphor = move. Drawn in
 *  screen-buffer coords (x/y already account for DPR). */
export function drawCursorReticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: "fire" | "equipment" | "move",
): void {
  const triple = kind === "fire" ? ALARM : kind === "equipment" ? PICKUP_HUE : PHOSPHOR;
  const r = 13;
  ctx.save();
  ctx.translate(x, y);
  const path = new Path2D();

  if (kind === "fire") {
    const s = r;
    const corners: ReadonlyArray<{ sx: number; sy: number }> = [
      { sx: -1, sy: -1 },
      { sx: 1, sy: -1 },
      { sx: -1, sy: 1 },
      { sx: 1, sy: 1 },
    ];
    for (const { sx, sy } of corners) {
      path.moveTo(sx * s, sy * s - sy * 6);
      path.lineTo(sx * s, sy * s);
      path.lineTo(sx * s - sx * 6, sy * s);
    }
    path.moveTo(1.6, 0);
    path.arc(0, 0, 1.6, 0, Math.PI * 2);
  } else if (kind === "equipment") {
    path.moveTo(0, -r);
    path.lineTo(r, 0);
    path.lineTo(0, r);
    path.lineTo(-r, 0);
    path.closePath();
  } else {
    path.moveTo(r, 0);
    path.arc(0, 0, r, 0, Math.PI * 2);
    path.moveTo(-5, 0);
    path.lineTo(5, 0);
    path.moveTo(0, -5);
    path.lineTo(0, 5);
  }
  glowStrokePath(ctx, path, triple, 1.6, 0.95);
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

/** Draw the touch button cluster + teleport-pending hint, phosphor-styled. */
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
    ctx.fillStyle = "rgba(2,7,6,0.55)";
    ctx.fill();
    const ring = new Path2D();
    ring.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
    glowStrokePath(ctx, ring, PHOSPHOR, 1.4, b.enabled ? 0.6 : 0.22);
    if (b.id === "teleport" && opts.pendingTeleport) {
      const pending = new Path2D();
      pending.arc(b.cx, b.cy, b.r + 3 * dpr, 0, Math.PI * 2);
      glowStrokePath(ctx, pending, PHOSPHOR, 1.8, 0.8);
    }
    ctx.fillStyle = b.enabled ? phos(0.9) : phos(0.35);
    ctx.font = `bold ${11 * dpr}px "Courier New", monospace`;
    ctx.fillText(b.label, b.cx, b.cy + (b.count !== null ? -4 * dpr : 0));
    if (b.count !== null) {
      ctx.font = `${10 * dpr}px "Courier New", monospace`;
      ctx.fillStyle = b.count > 0 ? "rgba(255,255,255,0.8)" : alarmC(0.9);
      ctx.fillText(`x${b.count}`, b.cx, b.cy + 9 * dpr);
    }
  }

  if (opts.pendingTeleport) {
    ctx.fillStyle = phos(0.95);
    ctx.font = `bold ${13 * dpr}px "Courier New", monospace`;
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
  ctx.fillStyle = "rgba(2,7,6,0.5)";
  ctx.fill();
  const ring = new Path2D();
  ring.arc(t.cx, t.cy, t.r, 0, Math.PI * 2);
  glowStrokePath(ctx, ring, PHOSPHOR, 1.2, on ? 0.6 : 0.3);
  ctx.fillStyle = on ? phos(0.9) : phos(0.4);
  ctx.font = `bold ${14 * dpr}px "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(on ? "[#]" : "[ ]", t.cx, t.cy);
  ctx.restore();
}
