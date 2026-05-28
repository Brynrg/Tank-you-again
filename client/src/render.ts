import {
  ItemType,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_FUEL,
  ProjectileKind,
  TANK_RADIUS,
  TeamColor,
  type GameStateSnapshot,
  type ProjectileState,
  type TankState,
} from "@shared/types";

// Terrain types for visual enhancement
enum TerrainType {
  EMPTY = "EMPTY",
  WALL = "WALL",
  WATER = "WATER",
  FOREST = "FOREST",
  ROCK = "ROCK",
}

// Terrain data structure
interface TerrainCell {
  type: TerrainType;
  x: number;
  y: number;
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

const TEAM_COLORS: Record<TeamColor, string> = {
  [TeamColor.BLUE]: "#3b82f6",
  [TeamColor.RED]: "#ef4444",
  [TeamColor.ORANGE]: "#f97316",
  [TeamColor.PURPLE]: "#a855f7",
};

const PICKUP_GLYPHS: Record<ItemType, string> = {
  [ItemType.FUEL_CRATE]: "F",
  [ItemType.MISSILE]: "M",
  [ItemType.MINE_PACK]: "■",
  [ItemType.SHIELD]: "S",
  [ItemType.RADAR]: "R",
  [ItemType.TELEPORT_CHARGE]: "T",
};

// Terrain colors
const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.EMPTY]: "#0b0b14",
  [TerrainType.WALL]: "#6b7280",
  [TerrainType.WATER]: "#3b82f633",
  [TerrainType.FOREST]: "#22c55e33",
  [TerrainType.ROCK]: "#9ca3af33",
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

// Death overlay state
let deathOverlay: DeathOverlay = { isDead: false, respawnTimer: 0, opacity: 0 };

// Initialize terrain system
export function initTerrain(): void {
  terrain.length = 0; // Clear existing terrain
  
  // Create sample terrain pattern
  const terrainSize = 128;
  for (let x = 0; x < MAP_WIDTH; x += terrainSize) {
    for (let y = 0; y < MAP_HEIGHT; y += terrainSize) {
      // Random terrain type with pattern
      const types = [TerrainType.EMPTY, TerrainType.WATER, TerrainType.FOREST, TerrainType.ROCK];
      const type = types[Math.floor(Math.random() * types.length)];
      
      if (type !== TerrainType.EMPTY) {
        terrain.push({ type: type!, x, y });
      }
    }
  }
  
  // Add some walls
  for (let i = 0; i < 15; i++) {
    const type = Math.random() > 0.5 ? TerrainType.WALL : TerrainType.ROCK;
    terrain.push({
      type,
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    });
  }
}

// Add hit effect
export function addHitEffect(x: number, y: number, type: HitEffectType): void {
  hitEffects.push({
    x, y, type,
    frame: 0,
    maxFrames: type === HitEffectType.BULLET ? 2 : type === HitEffectType.MISSILE ? 3 : 4
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

  // Background
  ctx.fillStyle = "#0b0b14";
  ctx.fillRect(0, 0, W, H);

  // Draw terrain
  drawTerrain(ctx, cam, W, H);

  drawGrid(ctx, cam, W, H);
  drawMapBounds(ctx, cam, W, H);

  // Pickups (drawn below tanks)
  for (const pk of snap.pickups) {
    const p = project(cam, W, H, pk.x, pk.y);
    ctx.save();
    
    // Different colors for different pickup types
    const colors = {
      [ItemType.FUEL_CRATE]: "#22c55e",
      [ItemType.MISSILE]: "#ef4444", 
      [ItemType.MINE_PACK]: "#8b5cf6",
      [ItemType.SHIELD]: "#22d3ee",
      [ItemType.RADAR]: "#facc15",
      [ItemType.TELEPORT_CHARGE]: "#a855f7",
    };
    
    const color = colors[pk.type] || "#facc15";
    
    // Draw pickup with gradient
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 15 * cam.zoom);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color + "99");
    
    ctx.fillStyle = gradient;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    // Different shapes for different types
    if (pk.type === ItemType.FUEL_CRATE) {
      // Square for fuel
      ctx.fillRect(p.x - 10 * cam.zoom, p.y - 10 * cam.zoom, 20 * cam.zoom, 20 * cam.zoom);
      ctx.strokeRect(p.x - 10 * cam.zoom, p.y - 10 * cam.zoom, 20 * cam.zoom, 20 * cam.zoom);
    } else {
      // Circle for others
      ctx.arc(p.x, p.y, 10 * cam.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    
    // Inner symbol
    ctx.fillStyle = "#0b0b14";
    ctx.font = `${Math.max(10, 12 * cam.zoom)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(PICKUP_GLYPHS[pk.type] ?? "?", p.x, p.y);
    
    // Pulsing effect
    const time = Date.now() / 1000;
    const pulse = 0.8 + Math.sin(time * 3) * 0.2;
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12 * cam.zoom, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
  }

  // Visible mines (own / ally / radar-detected)
  for (const m of snap.visibleMines) {
    const p = project(cam, W, H, m.x, m.y);
    ctx.save();
    ctx.fillStyle = "#ef4444aa";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8 * cam.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff8";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Projectiles
  for (const proj of snap.projectiles) {
    drawProjectile(ctx, cam, W, H, proj);
  }

  // Draw hit effects
  for (const effect of hitEffects) {
    drawHitEffect(ctx, cam, W, H, effect);
  }

  if (commandTarget) {
    drawCommandTarget(ctx, cam, W, H, commandTarget);
  }

  // Tanks
  for (const t of snap.tanks) {
    drawTank(ctx, cam, W, H, t, t.id === yourTankId);
  }
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
  ctx.strokeStyle = "#1f1f33";
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
  ctx.strokeStyle = "#facc1555";
  ctx.lineWidth = 2;
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.restore();
}

function drawTerrain(ctx: CanvasRenderingContext2D, cam: Camera, W: number, H: number): void {
  for (const t of terrain) {
    const p = project(cam, W, H, t.x, t.y);
    const size = 80 * cam.zoom; // Terrain tile size
    
    ctx.save();
    ctx.fillStyle = TERRAIN_COLORS[t.type];
    
    if (t.type === TerrainType.WALL) {
      // Draw walls as rectangles
      ctx.fillRect(p.x - size/2, p.y - size/2, size, size);
    } else if (t.type === TerrainType.WATER) {
      // Draw water as circles
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size/2, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.type === TerrainType.FOREST) {
      // Draw forest as squares with pattern
      ctx.fillRect(p.x - size/2, p.y - size/2, size, size);
      ctx.fillStyle = "#22c55e55";
      for (let i = 0; i < 3; i++) {
        const offsetX = (Math.random() - 0.5) * size * 0.6;
        const offsetY = (Math.random() - 0.5) * size * 0.6;
        ctx.fillRect(p.x + offsetX - size/8, p.y + offsetY - size/8, size/4, size/4);
      }
    } else if (t.type === TerrainType.ROCK) {
      // Draw rocks as irregular polygons
      ctx.beginPath();
      const sides = 6;
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        const radius = size/2 * (0.8 + Math.random() * 0.4);
        const x = p.x + Math.cos(angle) * radius;
        const y = p.y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
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
  
  // Shield ring
  if (t.hasShield) {
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
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
 
  // Name + fuel bar
  ctx.save();
  ctx.font = `${Math.max(11, 12 * cam.zoom)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#facc15";
  ctx.fillText(t.name, p.x, p.y - r - 14);
  // Fuel bar
  const barW = r * 2.5;
  const barH = 3;
  const bx = p.x - barW / 2;
  const by = p.y - r - 8;
  ctx.fillStyle = "#1f1f33";
  ctx.fillRect(bx, by, barW, barH);
  const pct = Math.max(0, Math.min(1, t.fuel / MAX_FUEL));
  ctx.fillStyle = pct > 0.5 ? "#22c55e" : pct > 0.2 ? "#facc15" : "#ef4444";
  ctx.fillRect(bx, by, barW * pct, barH);
  ctx.restore();
 
  // Armor visualization
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(t.angle);
  
  // Front armor visualization
  const frontArmorPct = t.armor.front / 100;
  const frontColor = frontArmorPct > 0.7 ? "#22c55e" : frontArmorPct > 0.4 ? "#facc15" : "#ef4444";
  ctx.fillStyle = frontColor;
  ctx.fillRect(-r, -r * 0.7, r * 2, r * 1.4 * frontArmorPct);
  
  // Side armor visualization (left and right)
  const sideArmorPct = t.armor.side / 100;
  const sideColor = sideArmorPct > 0.7 ? "#22c55e" : sideArmorPct > 0.4 ? "#facc15" : "#ef4444";
  ctx.fillStyle = sideColor;
  // Left side
  ctx.fillRect(-r, -r * 0.7, r * 0.5, r * 1.4 * sideArmorPct);
  // Right side
  ctx.fillRect(r * 1.5, -r * 0.7, r * 0.5, r * 1.4 * sideArmorPct);
  
  // Rear armor visualization
  const rearArmorPct = t.armor.rear / 100;
  const rearColor = rearArmorPct > 0.7 ? "#22c55e" : rearArmorPct > 0.4 ? "#facc15" : "#ef4444";
  ctx.fillStyle = rearColor;
  ctx.fillRect(-r, r * 0.7 - r * 1.4 * rearArmorPct, r * 2, r * 1.4 * rearArmorPct);
  
  ctx.restore();
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
      ctx.fillRect(trailX, -trailWidth/2, 4, trailWidth);
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

  ctx.save();
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#facc15dd";

  // Top-left: status / tick / rtt (raw debug info)
  ctx.fillText(`srv tick=${state.serverTick}  rtt=${state.rttMs}ms  ws=${state.status}`, 8, 16);
  
  // Raw debug info area - show more detailed information
  if (state.snap) {
    ctx.fillStyle = "#facc15bb";
    ctx.fillText(
      `Tanks: ${state.snap.tanks.length} | Pickups: ${state.snap.pickups.length} | Mines: ${state.snap.visibleMines.length}`,
      8,
      34,
    );
    ctx.fillText(
      `Projectiles: ${state.snap.projectiles.length} | Teams: ${new Set(state.snap.tanks.map(t => t.team)).size}`,
      8,
      52,
    );
  }

  ctx.fillStyle = "#facc15dd";

  if (state.yourTank) {
    const t = state.yourTank;
    // Bottom-left: fuel - no low-fuel warning
    const barW = 220;
    const barH = 14;
    const bx = 8;
    const by = H - 62;
    ctx.fillStyle = "#1f1f33";
    ctx.fillRect(bx, by, barW, barH);
    const pct = Math.max(0, Math.min(1, t.fuel / MAX_FUEL));
    ctx.fillStyle = pct > 0.5 ? "#22c55e" : pct > 0.2 ? "#facc15" : "#ef4444";
    ctx.fillRect(bx, by, barW * pct, barH);
    ctx.fillStyle = "#facc15";
    ctx.fillText(
      `FUEL ${Math.round(t.fuel)} / ${MAX_FUEL}  ${t.hasShield ? "[shield]" : ""}`,
      bx,
      by - 4,
    );
    // Bottom-left: ammo (no cooldown feedback)
    ctx.fillStyle = "#facc15";
    ctx.fillText(
      `MIS ${t.ammo.missiles}   MINE ${t.ammo.mines}   TP ${t.ammo.teleports}   SH ${t.ammo.shields}   RAD ${t.ammo.radar}   RANK ${t.rank}`,
      bx,
      by + barH + 14,
    );
    if (state.snap) {
      ctx.fillText(
        `RADAR sees fuel/equipment:${state.snap.pickups.length} mines:${state.snap.visibleMines.length}`,
        bx,
        by + barH + 28,
      );
    }
    // No kill feed visible tanks info only (no scoreboard)
    if (state.snap) {
      const visible = state.snap.tanks.length;
      ctx.textAlign = "right";
      ctx.fillText(`visible tanks: ${visible}`, W - 8, H - 8);
    }
  } else {
    ctx.fillText("Waiting for spawn…", 8, H - 8);
  }

  ctx.restore();
  // Controls help line - no boundary warning
  ctx.save();
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = "#facc1599";
  ctx.textAlign = "right";
  ctx.fillText(
    "LMB move · Space fire · RMB/K missile · M mine · R radar · Shift shield · X stop",
    W - 8,
    16,
  );
  ctx.restore();
}

// Draw death overlay
if (deathOverlay.isDead) {
  drawDeathOverlay(ctx, W, H);
}

function drawDeathOverlay(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.save();
  
  // Semi-transparent dark overlay
  ctx.globalAlpha = deathOverlay.opacity;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  
  // "YOU DIED" text
  if (deathOverlay.respawnTimer > 0) {
    ctx.fillStyle = "#fff";
    ctx.font = "24px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("YOU DIED", W/2, H/2 - 30);
    
    // Respawn countdown
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText(`Respawning in ${Math.ceil(deathOverlay.respawnTimer / 20)}...`, W/2, H/2 + 10);
  }
  
  ctx.restore();
}