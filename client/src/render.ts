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

  // Background
  ctx.fillStyle = "#0b0b14";
  ctx.fillRect(0, 0, W, H);

  drawGrid(ctx, cam, W, H);
  drawMapBounds(ctx, cam, W, H);

  // Pickups (drawn below tanks)
  for (const pk of snap.pickups) {
    const p = project(cam, W, H, pk.x, pk.y);
    ctx.save();
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#facc1599";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10 * cam.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0b0b14";
    ctx.font = `${Math.max(10, 12 * cam.zoom)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(PICKUP_GLYPHS[pk.type] ?? "?", p.x, p.y);
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
 
  // Hull
  ctx.translate(p.x, p.y);
  ctx.rotate(t.angle);
  ctx.fillStyle = t.isDead ? "#333" : teamColor;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(-r, -r * 0.7, r * 2, r * 1.4);
  ctx.fill();
  ctx.stroke();
  ctx.rotate(-t.angle);
 
  // Turret
  ctx.rotate(t.turretAngle);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, -r * 0.18, r * 1.6, r * 0.36);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
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
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 3 * cam.zoom, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "#ef4444";
    ctx.translate(sp.x, sp.y);
    ctx.rotate(Math.atan2(p.vy, p.vx));
    ctx.fillRect(-8 * cam.zoom, -3 * cam.zoom, 12 * cam.zoom, 6 * cam.zoom);
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

  // Top-left: status / tick / rtt
  ctx.fillText(`srv tick=${state.serverTick}  rtt=${state.rttMs}ms  ws=${state.status}`, 8, 16);
  ctx.fillStyle = "#facc15bb";
  ctx.fillText(
    "Objective: deactivate rivals. Fuel is health; radar finds supplies and mines.",
    8,
    34,
  );
  ctx.fillStyle = "#facc15dd";

  if (state.yourTank) {
    const t = state.yourTank;
    // Bottom-left: fuel
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
    // Bottom-left: ammo
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
    // Bottom-right: kill count from snap (sum of dead enemies seen — not authoritative)
    if (state.snap) {
      const visible = state.snap.tanks.length;
      ctx.textAlign = "right";
      ctx.fillText(`visible tanks: ${visible}`, W - 8, H - 8);
    }
  } else {
    ctx.fillText("Waiting for spawn…", 8, H - 8);
  }

  ctx.restore();
  // Controls help line
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