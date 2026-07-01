/**
 * LLM Arena — local LLMs pilot tanks against each other in a free-for-all.
 *
 * Each pilot is added to the headless Arena as a "human" player. The match
 * runs in lockstep: every DECISION_WINDOW ticks the sim pauses, every living
 * pilot receives a text observation of the battlefield and replies with one
 * JSON action. Sim time is decoupled from wall-clock, so slow models are not
 * mechanically disadvantaged.
 *
 * The harness provides a fire-control computer (intercept lead against the
 * target's live velocity); pilots are judged on tactics, not trigonometry.
 *
 * Run from repo root:
 *   SPARK_KEY=sk-... npx tsx scripts/llm-arena.ts [--rounds 80] [--window 50]
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { Arena } from "../shared/sim/arena";
import {
  BULLET_COOLDOWN_TICKS,
  BULLET_SPEED,
  FUEL_FIRE_BULLET,
  FUEL_FIRE_MISSILE,
  ItemType,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_FUEL,
  MISSILE_COOLDOWN_TICKS,
  MISSILE_SPEED,
  ProjectileKind,
  TeamColor,
  TICK_MS,
  type GameEvent,
  type GameStateSnapshot,
  type TankState,
} from "../shared/types";

// ── CLI ──────────────────────────────────────────────────────────────────────

function argNum(flag: string, dflt: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0) return dflt;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : dflt;
}

const ROUNDS = argNum("--rounds", 80);
const WINDOW_TICKS = argNum("--window", 50); // 2.5s of game time at 20 Hz

// ── Pilot configuration ─────────────────────────────────────────────────────

interface PilotCfg {
  key: string;
  name: string;
  team: TeamColor;
  url: string;
  model?: string;
  apiKey?: string;
  extraBody?: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
  spawn: { x: number; y: number };
}

const C = (MAP_WIDTH / 2) | 0; // ~1773
const OFF = 500;
const THINK_OFF = { chat_template_kwargs: { enable_thinking: false } };

const PILOTS: PilotCfg[] = [
  {
    key: "coder",
    name: "GLM-Coder",
    team: TeamColor.RED,
    url: "http://127.0.0.1:8088/v1/chat/completions",
    extraBody: THINK_OFF,
    maxTokens: 600,
    timeoutMs: 60_000,
    spawn: { x: C - OFF, y: C - OFF },
  },
  {
    key: "heretic",
    name: "Heretic-35B",
    team: TeamColor.BLUE,
    url: "http://127.0.0.1:8080/v1/chat/completions",
    extraBody: THINK_OFF,
    maxTokens: 600,
    timeoutMs: 60_000,
    spawn: { x: C + OFF, y: C - OFF },
  },
  {
    key: "granite",
    name: "Granite-2B",
    team: TeamColor.ORANGE,
    url: "http://100.120.62.112:11434/v1/chat/completions",
    model: "granite3.3-2b-ctx16k",
    maxTokens: 300,
    timeoutMs: 45_000,
    spawn: { x: C - OFF, y: C + OFF },
  },
  {
    key: "glmair",
    name: "GLM-Air",
    team: TeamColor.PURPLE,
    url: "http://100.108.249.113:4000/v1/chat/completions",
    model: "glm-4.5-air",
    apiKey: process.env.SPARK_KEY,
    extraBody: THINK_OFF,
    maxTokens: 800,
    timeoutMs: 120_000,
    spawn: { x: C + OFF, y: C + OFF },
  },
];

// ── Action schema ────────────────────────────────────────────────────────────

interface FirePlan {
  weapon: ProjectileKind;
  targetId: string;
  repeat: boolean;
}

interface PilotAction {
  moveTo?: { x: number; y: number } | "stop" | null;
  fire?: FirePlan | null;
  placeMine?: boolean;
  useItem?: ItemType.SHIELD | ItemType.RADAR | null;
  teleport?: { x: number; y: number } | null;
  depositFuel?: boolean;
  say?: string;
}

interface ParseOutcome {
  ok: boolean;
  action: PilotAction;
  error?: string;
}

// ── Prompt construction ──────────────────────────────────────────────────────

function systemPrompt(p: PilotCfg): string {
  return `You are ${p.name}, an AI pilot controlling a tank in "Tank You Again" — a top-down free-for-all arena deathmatch against three other AI pilots. Goal: most kills, fewest deaths.

ARENA: ${MAP_WIDTH}x${MAP_HEIGHT} units. x grows right, y grows DOWN (north = smaller y).
FUEL = HEALTH = ENERGY: max ${MAX_FUEL}, you DIE at 0. Passive regen +2.5/s. Costs: moving 8/s, bullet 5, missile 25, mine 40, shield 30/s while on, teleport 80, radar 35. Getting hit drains fuel: bullet ~60, missile ~240, mine 250. A raised shield halves incoming damage. FUEL_CRATE pickups restore 350 — grabbing fuel keeps you alive.
WEAPONS: bullets are cheap and fast (600 u/s, one shot per 0.25s). Missiles hit 4x harder but are slower (380 u/s, one per 0.9s) and use limited ammo. Mines (250 dmg) drop at your position and detonate on enemy contact. Your fire-control computer auto-leads moving targets; under ~500 units range most shots connect, beyond ~800 they rarely do.
RULES OF THE FIELD: death respawns you after 3s at a RANDOM location with only 60% fuel and reduced ammo — dying is expensive. Fresh spawns have 4s of invulnerable spawn protection (shots through them are wasted). Kills raise your power tier: more damage and speed. Pickups (fuel/missiles/mines/shield/radar/teleport) dot the map. Teleport range is 400, good for escapes. Radar reveals hidden pickups and enemy mines nearby.

Each turn lasts 2.5 seconds of game time. You will receive the battlefield state and must reply with ONE action as JSON only — no prose before or after:
{
  "move_to": {"x": <num>, "y": <num>} | "stop" | null,
  "fire": {"weapon": "BULLET" | "MISSILE", "target_id": "<enemy tank id>"} | null,
  "fire_repeat": true | false,
  "place_mine": true | false,
  "use_item": "SHIELD" | "RADAR" | null,
  "teleport": {"x": <num>, "y": <num>} | null,
  "deposit_fuel": false,
  "say": "<short trash talk, optional>"
}
Notes: "move_to": null keeps your current movement order. "fire_repeat": true keeps shooting that target the whole turn (bullets ~10 shots = 50 fuel; missiles ~3 shots = 75 fuel). Shield stays up (draining 30/s) until toggled again with "use_item":"SHIELD". Reply with the JSON object only.`;
}

function compass(dx: number, dy: number): string {
  // y grows down: north is -y.
  const ang = Math.atan2(dy, dx); // -PI..PI, 0 = east
  const oct = Math.round(ang / (Math.PI / 4));
  const names: Record<number, string> = {
    0: "E",
    1: "SE",
    2: "S",
    3: "SW",
    4: "W",
    [-4]: "W",
    [-3]: "NW",
    [-2]: "N",
    [-1]: "NE",
  };
  return names[oct] ?? "?";
}

interface PilotRoundFeedback {
  parseNote: string;
  events: string[];
}

function observation(
  p: PilotCfg,
  tankId: string,
  snap: GameStateSnapshot,
  round: number,
  fb: PilotRoundFeedback,
  deaths: Map<string, number>,
  names: Map<string, string>,
): string {
  const me = snap.tanks.find((t) => t.id === tankId);
  if (!me) return "";
  const lines: string[] = [];
  const gameSec = ((snap.tick * TICK_MS) / 1000).toFixed(1);
  lines.push(`TURN ${round}/${ROUNDS} | game time ${gameSec}s`);
  lines.push(
    `YOU [${tankId}]: pos(${me.x | 0},${me.y | 0}) fuel ${me.fuel | 0}/${MAX_FUEL}` +
      ` shield:${me.hasShield ? "ON" : "off"} tier:${me.powerTier ?? 0}` +
      ` kills:${me.kills ?? 0} deaths:${deaths.get(tankId) ?? 0}` +
      ` spawnProtected:${me.isSpawnProtected ? "yes" : "no"}` +
      ` ammo{missiles:${me.ammo.missiles},mines:${me.ammo.mines},teleports:${me.ammo.teleports},shields:${me.ammo.shields},radar:${me.ammo.radar}}`,
  );

  lines.push("ENEMIES:");
  for (const t of snap.tanks) {
    if (t.id === tankId) continue;
    const dx = t.x - me.x;
    const dy = t.y - me.y;
    const dist = Math.hypot(dx, dy) | 0;
    if (t.isDead) {
      lines.push(`- ${t.id} "${names.get(t.id) ?? t.name}": DEAD (respawning soon)`);
    } else {
      lines.push(
        `- ${t.id} "${names.get(t.id) ?? t.name}": pos(${t.x | 0},${t.y | 0}) dist ${dist} dir ${compass(dx, dy)}` +
          ` fuel ${t.fuel | 0} shield:${t.hasShield ? "ON" : "off"} tier:${t.powerTier ?? 0} kills:${t.kills ?? 0}` +
          (t.isSpawnProtected ? " SPAWN-PROTECTED(invulnerable)" : ""),
      );
    }
  }

  const byDist = snap.pickups
    .map((pk) => ({ pk, d: Math.hypot(pk.x - me.x, pk.y - me.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  lines.push(
    byDist.length
      ? "PICKUPS (nearest): " +
          byDist
            .map(
              ({ pk, d }) =>
                `${pk.type}(${pk.x | 0},${pk.y | 0}) dist ${d | 0} dir ${compass(pk.x - me.x, pk.y - me.y)}`,
            )
            .join(" | ")
      : "PICKUPS: none visible",
  );

  const incoming = snap.projectiles
    .filter((pr) => pr.ownerId !== tankId)
    .map((pr) => ({ pr, d: Math.hypot(pr.x - me.x, pr.y - me.y) }))
    .filter(({ d }) => d < 600);
  if (incoming.length) {
    lines.push(
      `INCOMING FIRE: ${incoming.length} projectile(s) within 600u (closest ${Math.min(...incoming.map(({ d }) => d)) | 0}u)`,
    );
  }
  const mines = snap.visibleMines.filter((m) => m.ownerId !== tankId);
  if (mines.length) {
    lines.push("KNOWN ENEMY MINES: " + mines.map((m) => `(${m.x | 0},${m.y | 0})`).join(" "));
  }

  if (fb.events.length) lines.push("SINCE YOUR LAST TURN: " + fb.events.join("; "));
  if (fb.parseNote) lines.push(`YOUR LAST REPLY: ${fb.parseNote}`);
  lines.push("Reply with your action JSON now.");
  return lines.join("\n");
}

// ── Reply parsing ────────────────────────────────────────────────────────────

function extractJsonObject(text: string): string | null {
  // Strip reasoning traces and code fences, then take the first balanced {...}.
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

function parseAction(raw: string, validTargets: Set<string>): ParseOutcome {
  const json = extractJsonObject(raw);
  if (!json) return { ok: false, action: {}, error: "no JSON object found in reply" };
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(json) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, action: {}, error: `JSON.parse failed: ${(e as Error).message}` };
  }

  const action: PilotAction = {};
  const issues: string[] = [];

  const mv = obj["move_to"];
  if (mv === "stop") action.moveTo = "stop";
  else if (mv && typeof mv === "object") {
    const m = mv as Record<string, unknown>;
    const x = Number(m["x"]);
    const y = Number(m["y"]);
    if (Number.isFinite(x) && Number.isFinite(y)) action.moveTo = { x, y };
    else issues.push("move_to had non-numeric x/y (ignored)");
  }

  const fire = obj["fire"];
  if (fire && typeof fire === "object") {
    const f = fire as Record<string, unknown>;
    const weapon = f["weapon"] === "MISSILE" ? ProjectileKind.MISSILE : ProjectileKind.BULLET;
    const targetId = String(f["target_id"] ?? f["target"] ?? "");
    if (validTargets.has(targetId)) {
      action.fire = { weapon, targetId, repeat: obj["fire_repeat"] !== false };
    } else {
      issues.push(`fire.target_id "${targetId}" is not a valid enemy id (ignored)`);
    }
  }

  if (obj["place_mine"] === true) action.placeMine = true;
  const item = obj["use_item"];
  if (item === "SHIELD") action.useItem = ItemType.SHIELD;
  else if (item === "RADAR") action.useItem = ItemType.RADAR;

  const tp = obj["teleport"];
  if (tp && typeof tp === "object") {
    const t = tp as Record<string, unknown>;
    const x = Number(t["x"]);
    const y = Number(t["y"]);
    if (Number.isFinite(x) && Number.isFinite(y)) action.teleport = { x, y };
    else issues.push("teleport had non-numeric x/y (ignored)");
  }

  if (obj["deposit_fuel"] === true) action.depositFuel = true;
  if (typeof obj["say"] === "string" && obj["say"])
    action.say = (obj["say"] as string).slice(0, 120);

  return { ok: true, action, error: issues.length ? issues.join("; ") : undefined };
}

// ── Model client ─────────────────────────────────────────────────────────────

interface CallResult {
  content: string;
  latencyMs: number;
  error?: string;
}

async function callPilot(p: PilotCfg, system: string, user: string): Promise<CallResult> {
  const body: Record<string, unknown> = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: p.maxTokens,
    temperature: 0.4,
    ...(p.extraBody ?? {}),
  };
  if (p.model) body["model"] = p.model;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (p.apiKey) headers["Authorization"] = `Bearer ${p.apiKey}`;

  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), p.timeoutMs);
    const res = await fetch(p.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      return {
        content: "",
        latencyMs,
        error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) return { content: "", latencyMs, error: "empty content in response" };
    return { content, latencyMs };
  } catch (e) {
    return {
      content: "",
      latencyMs: Date.now() - t0,
      error: e instanceof Error && e.name === "AbortError" ? "timeout" : String(e),
    };
  }
}

// ── Fire control ─────────────────────────────────────────────────────────────

function interceptAngle(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  tvx: number,
  tvy: number,
  projSpeed: number,
): number {
  const rx = tx - sx;
  const ry = ty - sy;
  const a = tvx * tvx + tvy * tvy - projSpeed * projSpeed;
  const b = 2 * (rx * tvx + ry * tvy);
  const c = rx * rx + ry * ry;
  let t: number | null = null;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const cands = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].filter((v) => v > 0);
      if (cands.length) t = Math.min(...cands);
    }
  }
  if (t === null || !Number.isFinite(t) || t <= 0 || t > 4) return Math.atan2(ry, rx);
  return Math.atan2(ty + tvy * t - sy, tx + tvx * t - sx);
}

// ── Match ────────────────────────────────────────────────────────────────────

interface PilotStats {
  rounds: number;
  skippedDead: number;
  callErrors: number;
  parseErrors: number;
  softIssues: number;
  latencies: number[];
  shotsFired: { BULLET: number; MISSILE: number };
  minesPlaced: number;
  teleports: number;
  shieldToggles: number;
  radarScans: number;
  fuelCratesGrabbed: number;
  says: string[];
}

function freshStats(): PilotStats {
  return {
    rounds: 0,
    skippedDead: 0,
    callErrors: 0,
    parseErrors: 0,
    softIssues: 0,
    latencies: [],
    shotsFired: { BULLET: 0, MISSILE: 0 },
    minesPlaced: 0,
    teleports: 0,
    shieldToggles: 0,
    radarScans: 0,
    fuelCratesGrabbed: 0,
    says: [],
  };
}

async function main(): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const logDir = path.join("scripts", "llm-arena-logs", stamp);
  fs.mkdirSync(logDir, { recursive: true });
  const decisionsLog = fs.createWriteStream(path.join(logDir, "decisions.jsonl"));
  const feedLog = fs.createWriteStream(path.join(logDir, "feed.jsonl"));
  const replayLog = fs.createWriteStream(path.join(logDir, "replay.jsonl"));

  const arena = new Arena({ aiTargetCount: 0, trackXp: true });
  const tanks = new Map<string, TankState>();
  const names = new Map<string, string>();
  const stats = new Map<string, PilotStats>();
  const deaths = new Map<string, number>();
  const feedback = new Map<string, PilotRoundFeedback>();
  const lastFired = new Map<string, { BULLET: number; MISSILE: number }>();
  const prevPos = new Map<string, { x: number; y: number }>();
  const velocity = new Map<string, { vx: number; vy: number }>();

  for (const p of PILOTS) {
    const tank = arena.addPlayer({ id: `t-${p.key}`, name: p.name, team: p.team, spawn: p.spawn });
    tanks.set(p.key, tank);
    names.set(tank.id, p.name);
    stats.set(p.key, freshStats());
    deaths.set(tank.id, 0);
    feedback.set(p.key, { parseNote: "", events: [] });
    lastFired.set(p.key, { BULLET: -1_000_000, MISSILE: -1_000_000 });
    prevPos.set(tank.id, { x: tank.x, y: tank.y });
  }
  arena.seedPickups(14);
  arena.drainEvents();

  const idToPilot = new Map<string, PilotCfg>();
  for (const p of PILOTS) idToPilot.set(`t-${p.key}`, p);
  const allIds = new Set(idToPilot.keys());

  const feed = (line: string, kind = "info"): void => {
    console.log(line);
    feedLog.write(JSON.stringify({ tick: arena.tickIndex, kind, line }) + "\n");
  };

  feed(
    `MATCH START: ${PILOTS.map((p) => `${p.name}[t-${p.key}/${p.team}]`).join(" vs ")} — ${ROUNDS} turns x ${WINDOW_TICKS} ticks`,
  );

  const firePlans = new Map<string, FirePlan>();

  for (let round = 1; round <= ROUNDS; round++) {
    // ── Decision phase: query every living pilot in parallel ──
    const spectator = arena.snapshotFor("__spectator__", false);
    const results = await Promise.all(
      PILOTS.map(async (p) => {
        const tank = tanks.get(p.key)!;
        const st = stats.get(p.key)!;
        if (tank.isDead) {
          st.skippedDead++;
          return { p, outcome: null as ParseOutcome | null, call: null as CallResult | null };
        }
        st.rounds++;
        const fb = feedback.get(p.key)!;
        const obs = observation(p, tank.id, spectator, round, fb, deaths, names);
        const call = await callPilot(p, systemPrompt(p), obs);
        if (call.error) {
          st.callErrors++;
          st.latencies.push(call.latencyMs);
          return { p, outcome: null, call };
        }
        st.latencies.push(call.latencyMs);
        const valid = new Set([...allIds].filter((id) => id !== tank.id));
        const outcome = parseAction(call.content, valid);
        return { p, outcome, call };
      }),
    );

    // ── Apply actions ──
    for (const { p, outcome, call } of results) {
      const tank = tanks.get(p.key)!;
      const st = stats.get(p.key)!;
      const fb = feedback.get(p.key)!;
      fb.events = [];

      if (!outcome) {
        if (call) {
          fb.parseNote = `MODEL CALL FAILED (${call.error}) — you coasted.`;
          firePlans.delete(p.key);
        }
        decisionsLog.write(
          JSON.stringify({
            round,
            tick: arena.tickIndex,
            pilot: p.key,
            ok: false,
            error: call?.error ?? "dead-skip",
            latencyMs: call?.latencyMs ?? 0,
          }) + "\n",
        );
        continue;
      }

      if (!outcome.ok) {
        st.parseErrors++;
        fb.parseNote = `PARSE ERROR (${outcome.error}) — you coasted. Reply with ONLY the JSON object.`;
        firePlans.delete(p.key);
      } else {
        fb.parseNote = outcome.error ? `accepted with issues: ${outcome.error}` : "accepted";
        if (outcome.error) st.softIssues++;
        const a = outcome.action;
        const t = arena.tickIndex;
        if (a.teleport) {
          arena.teleport(tank.id, a.teleport.x, a.teleport.y);
          st.teleports++;
        }
        if (a.useItem) {
          arena.useItem(tank.id, a.useItem);
          if (a.useItem === ItemType.SHIELD) st.shieldToggles++;
          else st.radarScans++;
        }
        if (a.placeMine) {
          arena.placeMine(tank.id);
          st.minesPlaced++;
        }
        if (a.depositFuel) arena.depositFuel(tank.id);
        if (a.moveTo === "stop") arena.setStop(tank.id, t);
        else if (a.moveTo) arena.setMoveTo(tank.id, a.moveTo.x, a.moveTo.y, t);
        if (a.fire) firePlans.set(p.key, a.fire);
        else firePlans.delete(p.key);
        if (a.say) {
          st.says.push(a.say);
          feed(`💬 ${p.name}: "${a.say}"`, "say");
        }
      }

      decisionsLog.write(
        JSON.stringify({
          round,
          tick: arena.tickIndex,
          pilot: p.key,
          ok: outcome.ok,
          error: outcome.error,
          latencyMs: call?.latencyMs ?? 0,
          action: outcome.action,
          raw: (call?.content ?? "").slice(0, 700),
          you: { x: tank.x | 0, y: tank.y | 0, fuel: tank.fuel | 0, kills: tank.kills ?? 0 },
        }) + "\n",
      );
    }

    // ── Simulation phase ──
    for (let i = 0; i < WINDOW_TICKS; i++) {
      // Fire-control: one attempt per cooldown window per plan.
      for (const [key, plan] of firePlans) {
        const shooter = tanks.get(key)!;
        if (shooter.isDead) continue;
        const target = [...tanks.values()].find((t) => t.id === plan.targetId);
        if (!target || target.isDead || target.isSpawnProtected) continue;
        const lf = lastFired.get(key)!;
        const cdTicks =
          plan.weapon === ProjectileKind.MISSILE ? MISSILE_COOLDOWN_TICKS : BULLET_COOLDOWN_TICKS;
        const cost = plan.weapon === ProjectileKind.MISSILE ? FUEL_FIRE_MISSILE : FUEL_FIRE_BULLET;
        const last = plan.weapon === ProjectileKind.MISSILE ? lf.MISSILE : lf.BULLET;
        if (arena.tickIndex - last < cdTicks) continue;
        if (shooter.fuel < cost + 1) continue;
        if (plan.weapon === ProjectileKind.MISSILE && shooter.ammo.missiles <= 0) continue;
        const vel = velocity.get(target.id) ?? { vx: 0, vy: 0 };
        const speed = plan.weapon === ProjectileKind.MISSILE ? MISSILE_SPEED : BULLET_SPEED;
        const aim = interceptAngle(shooter.x, shooter.y, target.x, target.y, vel.vx, vel.vy, speed);
        arena.fire(shooter.id, plan.weapon, aim);
        if (plan.weapon === ProjectileKind.MISSILE) lf.MISSILE = arena.tickIndex;
        else lf.BULLET = arena.tickIndex;
        stats.get(key)!.shotsFired[plan.weapon === ProjectileKind.MISSILE ? "MISSILE" : "BULLET"]++;
        if (!plan.repeat) firePlans.delete(key);
      }

      arena.step();

      // Velocity estimates for the fire-control computer.
      for (const tank of tanks.values()) {
        const prev = prevPos.get(tank.id)!;
        const dt = TICK_MS / 1000;
        velocity.set(tank.id, { vx: (tank.x - prev.x) / dt, vy: (tank.y - prev.y) / dt });
        prev.x = tank.x;
        prev.y = tank.y;
      }

      // Events → kill feed + per-pilot feedback.
      for (const ev of arena.drainEvents()) {
        handleEvent(ev);
      }

      if (arena.tickIndex % 5 === 0) {
        const s = arena.snapshotFor("__spectator__", false);
        replayLog.write(
          JSON.stringify({
            tick: s.tick,
            tanks: s.tanks.map((t) => ({
              id: t.id,
              x: t.x | 0,
              y: t.y | 0,
              fuel: t.fuel | 0,
              dead: t.isDead,
              shield: t.hasShield,
              kills: t.kills ?? 0,
            })),
            projectiles: s.projectiles.map((pr) => ({ x: pr.x | 0, y: pr.y | 0, kind: pr.kind })),
            pickups: s.pickups.map((pk) => ({ x: pk.x | 0, y: pk.y | 0, type: pk.type })),
            mines: s.visibleMines.map((m) => ({ x: m.x | 0, y: m.y | 0 })),
          }) + "\n",
        );
      }
    }

    // ── Round status line ──
    const status = PILOTS.map((p) => {
      const t = tanks.get(p.key)!;
      return `${p.key}${t.isDead ? "✝" : ""}(${t.x | 0},${t.y | 0})f${t.fuel | 0}k${t.kills ?? 0}`;
    }).join(" | ");
    feed(`T${round} t=${arena.tickIndex} ${status}`, "status");
  }

  // ── Summary ──
  const summary = {
    rounds: ROUNDS,
    windowTicks: WINDOW_TICKS,
    gameSeconds: (ROUNDS * WINDOW_TICKS * TICK_MS) / 1000,
    pilots: PILOTS.map((p) => {
      const t = tanks.get(p.key)!;
      const st = stats.get(p.key)!;
      const lat = st.latencies.slice().sort((a, b) => a - b);
      const pct = (q: number): number =>
        lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] ?? 0;
      return {
        key: p.key,
        name: p.name,
        team: p.team,
        kills: t.kills ?? 0,
        deaths: deaths.get(t.id) ?? 0,
        finalFuel: t.fuel | 0,
        finalTier: t.powerTier ?? 0,
        rounds: st.rounds,
        skippedDead: st.skippedDead,
        callErrors: st.callErrors,
        parseErrors: st.parseErrors,
        softIssues: st.softIssues,
        latencyMs: lat.length ? { p50: pct(0.5), p90: pct(0.9), max: lat[lat.length - 1] } : null,
        shotsFired: st.shotsFired,
        minesPlaced: st.minesPlaced,
        teleports: st.teleports,
        shieldToggles: st.shieldToggles,
        radarScans: st.radarScans,
        fuelCratesGrabbed: st.fuelCratesGrabbed,
        says: st.says.slice(0, 20),
      };
    }),
  };
  fs.writeFileSync(path.join(logDir, "summary.json"), JSON.stringify(summary, null, 2));
  feed("MATCH OVER");
  for (const ps of summary.pilots) {
    feed(
      `${ps.name}: ${ps.kills} kills / ${ps.deaths} deaths | shots B${ps.shotsFired.BULLET}/M${ps.shotsFired.MISSILE}` +
        ` | parse errors ${ps.parseErrors}/${ps.rounds} | p50 ${ps.latencyMs?.p50 ?? "-"}ms`,
    );
  }
  console.log(`\nLogs: ${logDir}`);
  decisionsLog.end();
  feedLog.end();
  replayLog.end();

  function handleEvent(ev: GameEvent): void {
    const name = (id: string | undefined): string => (id && names.get(id)) || id || "?";
    if (ev.kind === "kill") {
      feed(`☠️  ${name(ev.subjectId)} killed ${name(ev.objectId)} (streak ${ev.payload})`, "kill");
      for (const [key] of tanks) {
        const fb = feedback.get(key)!;
        fb.events.push(`${name(ev.subjectId)} killed ${name(ev.objectId)}`);
      }
    } else if (ev.kind === "death") {
      if (ev.subjectId) deaths.set(ev.subjectId, (deaths.get(ev.subjectId) ?? 0) + 1);
      if (!ev.objectId) {
        feed(`⛽ ${name(ev.subjectId)} ran out of fuel and died`, "death");
        for (const [key] of tanks) {
          if (tanks.get(key)!.id === ev.subjectId) {
            feedback.get(key)!.events.push("you ran OUT OF FUEL and died — watch your fuel");
          } else {
            feedback.get(key)!.events.push(`${name(ev.subjectId)} ran out of fuel and died`);
          }
        }
      } else {
        for (const [key] of tanks) {
          if (tanks.get(key)!.id === ev.subjectId) {
            feedback
              .get(key)!
              .events.push(`you were KILLED by ${name(ev.objectId)} — you respawned elsewhere`);
          }
        }
      }
    } else if (ev.kind === "pickup") {
      const pilot = idToPilot.get(ev.subjectId ?? "");
      if (pilot && ev.payload === "FUEL_CRATE") stats.get(pilot.key)!.fuelCratesGrabbed++;
      if (pilot) feedback.get(pilot.key)!.events.push(`you collected ${ev.payload}`);
    } else if (ev.kind === "tier_up") {
      feed(`⬆️  ${name(ev.subjectId)} reached power tier ${ev.payload}`, "tier");
    } else if (ev.kind === "mine_detonate") {
      feed(`💥 mine detonated (owner ${name(ev.subjectId)})`, "mine");
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
