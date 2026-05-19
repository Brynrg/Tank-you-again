# Tank You Again — Improvement Plan

> Concrete, AI-agent-executable tasks. Each task names files, function signatures, and expected diffs. Tasks are independent within a tier unless noted.
>
> **Repo:** `brynr-builds/Tank-you-again`. **Branch off:** `main`. **PR target:** `main`.
> Use `npm` (not `pnpm`) — workspace is `npm workspaces` (see Notes for AI agents in `COMPLETION_STATUS.md`).

---

## P0 — Unblock everything else (do these first, in order)

### P0-1. Stand up the authoritative 20 Hz room loop

**Why:** No room loop exists. Until this lands, Phases 2–6 of TODO.md are blocked. Right now `server/src/index.ts` echoes inbound frames and never emits a `SNAPSHOT`.

**Files to add:**
- `server/src/loop.ts` — the `RoomLoop` class (defined below).
- `server/src/connection.ts` — per-WS connection wrapper that holds `playerId`, `tankId`, latest `INPUT`, send queue.
- (Modify) `server/src/index.ts` — instantiate a single `RoomLoop`, mount each new WS into it.

**Class signature — `server/src/loop.ts`:**

```ts
import {
  GameStateSnapshot,
  ClientInputMessage,
  TankState,
  ProjectileState,
  MineState,
  PickupState,
  MAP_WIDTH,
  MAP_HEIGHT,
  SERVER_TICK_RATE,
} from "@shared/types";
import type { Connection } from "./connection.js";

/** Per-connection input snapshot ingested into the next tick. */
export interface PlayerInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  aim: number;
  clientTick: number;
}

/**
 * Authoritative room. Single hot loop at SERVER_TICK_RATE Hz. All state
 * mutation happens inside `tick()`. Connections push intent via `ingestInput`;
 * `tick()` consumes the latest intent for each connection, simulates one
 * fixed step, then emits a masked snapshot to each connection.
 *
 * Important invariants:
 *   - Inputs are NEVER applied retroactively. Late `INPUT` frames clobber
 *     the slot for the current tick; older `clientTick` is dropped.
 *   - Snapshots are per-client (see Phase-4 mine masking, P1-4).
 *   - `tick()` is purely synchronous; no awaits inside the loop.
 */
export class RoomLoop {
  private readonly tickIntervalMs = 1000 / SERVER_TICK_RATE; // 50ms
  private timer: NodeJS.Timeout | null = null;
  private tickIndex = 0;

  private readonly connections = new Map<string, Connection>(); // connId -> Connection
  private readonly inputs = new Map<string, PlayerInputState>(); // connId -> latest intent
  private readonly tanks = new Map<string, TankState>(); // tankId -> TankState
  private readonly projectiles = new Map<string, ProjectileState>();
  private readonly mines = new Map<string, MineState>();
  private readonly pickups = new Map<string, PickupState>();

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Register a freshly-authenticated connection. Spawns a tank for it. */
  addConnection(conn: Connection): void { /* TODO P0-1.b */ }

  removeConnection(connId: string): void { /* TODO P0-1.b */ }

  ingestInput(connId: string, input: ClientInputMessage): void { /* TODO P0-1.c */ }

  /** One fixed simulation step. */
  private tick(): void { /* TODO P0-1.d */ }

  /** Build the world-truth snapshot, then mask per recipient (P1-4). */
  private buildSnapshotFor(connId: string): GameStateSnapshot { /* TODO P0-1.e */ }
}
```

**Connection wrapper — `server/src/connection.ts`:**

```ts
import type { WebSocket } from "ws";
import type { ServerMessage } from "@shared/types";

export interface Connection {
  id: string;          // crypto.randomUUID()
  socket: WebSocket;
  playerId: string;    // User.id once AUTH succeeds
  tankId: string;      // Tank.id assigned at addConnection
  name: string;
  team: "RED" | "BLUE" | "ORANGE" | "PURPLE";
}

export function send(conn: Connection, msg: ServerMessage): void {
  if (conn.socket.readyState === conn.socket.OPEN) {
    conn.socket.send(JSON.stringify(msg));
  }
}
```

**Expected diff to `server/src/index.ts` (replace L17–39):**

```ts
import { RoomLoop } from "./loop.js";
import type { Connection } from "./connection.js";
import { send } from "./connection.js";
import { ClientMessageType, ServerMessageType, MAP_WIDTH, MAP_HEIGHT } from "@shared/types";
import { randomUUID } from "node:crypto";

const room = new RoomLoop();
room.start();

await app.register(async (scope) => {
  scope.get("/ws", { websocket: true }, (socket, req) => {
    const conn: Connection = {
      id: randomUUID(),
      socket: socket as unknown as import("ws").WebSocket,
      playerId: "",
      tankId: "",
      name: "",
      team: "BLUE",
    };
    app.log.info({ remote: req.ip, connId: conn.id }, "ws client connected");

    socket.on("message", (raw: Buffer) => {
      let msg: unknown;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== "object") return;
      const m = msg as { type?: string };
      if (m.type === ClientMessageType.AUTH) {
        // P1-1: validate guestName / token, attach to room.
        room.addConnection(conn);
        send(conn, {
          type: ServerMessageType.WELCOME,
          yourTankId: conn.tankId,
          serverTickRate: 20,
          mapWidth: MAP_WIDTH,
          mapHeight: MAP_HEIGHT,
        });
      } else if (m.type === ClientMessageType.INPUT) {
        room.ingestInput(conn.id, msg as never);
      }
    });

    socket.on("close", () => {
      room.removeConnection(conn.id);
      app.log.info({ connId: conn.id }, "ws client disconnected");
    });
  });
});
```

**Snapshot protocol (already declared in `shared/types.ts`; this codifies the wire contract):**

```jsonc
{
  "type": "SNAPSHOT",
  "snapshot": {
    "tick": 1234,
    "timestamp": 1715000000000,
    "tanks": [/* TankState[], all tanks (own + visible enemies) */],
    "projectiles": [/* ProjectileState[], filtered to vision set */],
    "pickups": [/* PickupState[], in map vision */],
    "visibleMines": [/* MineState[], own + ally + radar-detected only */]
  }
}
```

**Acceptance:**
- `npm run typecheck` clean.
- Locally, `npm run dev` + a `wscat -c ws://localhost:3001/ws` + sending `{"type":"AUTH","guestName":"abc"}` produces a `WELCOME` then a steady ~20 `SNAPSHOT` frames/sec.
- Server log shows `tickIndex` advancing.

---

### P0-2. Add `speedrungames.json` manifest at `client/public/speedrungames.json`

**Why:** The umbrella `Brynrg/speedrungames` looks for a per-game manifest to surface the game in its catalog. Without it the home grid won't auto-discover this game. Format below matches the live `tower-wars` and `pokemonspeedrungen1` manifests in `Brynrg/speedrungames/apps/web/public/games/*/manifest.json` (the real-world precedent — the template at `Brynrg/speedrungames-game-template` uses a slimmer `v1` schema variant, but the umbrella's loader is the source of truth).

**File to add:** `client/public/speedrungames.json`

**Exact content the agent should write (copy verbatim):**

```json
{
  "slug": "tank-you-again",
  "title": "Tank You Again",
  "description": "Server-authoritative 2D top-down multiplayer tank game. TankPit/Battlefield 2006 clone — 8-way movement, fuel-as-health, landmines, masked radar, persistent military rank ladder.",
  "repo": "brynr-builds/Tank-you-again",
  "playUrl": "/games/tank-you-again/",
  "category": "multiplayer-action",
  "status": "wip",
  "framework": "vite-canvas",
  "supportsMobile": false,
  "version": "0.0.0",
  "emoji": "🛡️",
  "tags": ["tank", "multiplayer", "top-down", "websocket", "tankpit"],
  "backend": {
    "type": "websocket",
    "url": "wss://tank-you-again.fly.dev/ws"
  }
}
```

**Why this content:**
- `slug: "tank-you-again"` matches both the GitHub Actions `GAME_SLUG` env and the deploy path.
- `status: "wip"` is honest — the game is not playable yet. Flip to `"live"` when Phase 4 ships.
- `framework: "vite-canvas"` mirrors the convention used by other manifests (vs `"vanilla"`, `"other"`).
- `backend` block is bespoke (the umbrella's existing manifests don't have one) but documents the Fly.io WS URL the client will dial. The umbrella is free to ignore unknown keys.
- `repo` uses the actual GitHub org `brynr-builds/Tank-you-again` (note: distinct from `Brynrg/...`, which is the umbrella).

**Acceptance:**
- File exists at `client/public/speedrungames.json`.
- After `npx vite build --base=/games/tank-you-again/`, `client/dist/speedrungames.json` is present (Vite copies `public/` verbatim).
- `node -e "JSON.parse(require('fs').readFileSync('client/public/speedrungames.json','utf8'))"` exits 0.

---

### P0-3. Add `pnpm typecheck && pnpm build` CI gate (workflow YAML)

**Why:** Currently no workflow guards the full repo. `deploy-frontend.yml` only typechecks `client/` (and only on changes under `client/`/`shared/`). Server changes can land on `main` with TS errors.

**File to add:** `.github/workflows/ci.yml`

**Exact YAML the agent should write:**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  typecheck-and-build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm

      - name: Install
        run: npm ci --no-audit --no-fund

      - name: Generate Prisma client
        run: npx prisma generate --schema=server/prisma/schema.prisma

      - name: Typecheck (all workspaces)
        run: npm run typecheck

      - name: Build (server bundle + client)
        run: npm run build

      - name: Format check
        run: npm run format:check
```

**Notes:**
- The task brief specified `pnpm typecheck && pnpm build`. The repo uses `npm`, so the equivalent gate is the `npm run typecheck` + `npm run build` already exposed at the root. (See `package.json` L13–14.)
- `prisma generate` must run before typecheck — otherwise `@prisma/client` types aren't materialized and `server/src/index.ts` L4 fails.
- Add `format:check` because Prettier is configured and the repo will rot fast without it.

**Acceptance:**
- Open a PR with the new file; CI runs and passes on clean `main`.
- Force a TS error in `server/src/index.ts` → CI fails the typecheck step.

---

## P1 — Port the TODO.md spec features

> Each task references a section in `TODO.md`. Build on top of P0-1's `RoomLoop`.

### P1-1. WS AUTH + WELCOME handshake (TODO Phase 2)

**Files:**
- `server/src/auth.ts` (new): `handleAuth(msg, prisma): Promise<{ user: User; tank: Tank } | { error: string }>`.
- Modify `server/src/index.ts` to call `handleAuth` on `AUTH` before `room.addConnection`.

**Behavior:**
- If `msg.token` present → lookup `User` by session token (Phase 2 can stub session = userId for now).
- If `msg.guestName` present → run `validateUsername`, create `User { isGuest: true }` + `Tank { name: guestName, rank: "RECRUIT" }`.
- On failure, send `{ type: "ERROR", reason }` and close socket.

**Acceptance:** A guest connect end-to-end creates one `User` + one `Tank` row in Neon; `WELCOME.yourTankId` matches the created tank.

---

### P1-2. 8-way movement with fuel drain (TODO Phase 3)

**Files:**
- `server/src/sim/movement.ts` (new): `stepMovement(tank: TankState, input: PlayerInputState, dt: number): void`.
- Wire into `RoomLoop.tick()` (P0-1.d).

**Function signature:**

```ts
/**
 * Snaps hull to the 8-cardinal heading implied by up/down/left/right.
 * Moves at TANK_SPEED units/sec along that heading. Diagonals are normalized
 * to TANK_SPEED (no √2 cheese). Drains `FUEL_MOVE_PER_SEC * dt` fuel each
 * tick the tank is actually moving. Updates `tank.angle` to the new hull
 * direction; leaves `tank.turretAngle` alone (driven by `input.aim`).
 */
export function stepMovement(tank: TankState, input: PlayerInputState, dt: number): void;
```

**Tunables to add to `shared/types.ts`:**
```ts
export const TANK_SPEED = 120;         // world-units / sec
export const FUEL_MOVE_PER_SEC = 8;    // drain while moving
```

**Client side:**
- Add `client/src/input.ts` exporting `getCurrentInput(): ClientInputMessage` — reads keydown/keyup for WASD + arrows, plus `mousemove` for aim.
- Add `client/src/net.ts` exporting `sendInput(ws, input)`. Send INPUT at requestAnimationFrame rate; server clamps.

**Acceptance:** Two clients connected; pressing W on client A moves their tank visibly on client B's screen at ~20 Hz updates.

---

### P1-3. Fuel-as-health economy (TODO Phase 4)

**Files:**
- `server/src/sim/damage.ts` (new): `applyDamage(target: TankState, amount: number, killerId: string | null): "alive" | "killed"`.
- `server/src/sim/economy.ts` (new): `debitFuel(tank, amount, reason): boolean` (returns false if insufficient).

**Function signatures:**
```ts
export function applyDamage(
  target: TankState,
  amount: number,
  killerId: string | null,
): "alive" | "killed";

export function debitFuel(
  tank: TankState,
  amount: number,
  reason: "MOVE" | "FIRE_BULLET" | "FIRE_MISSILE" | "MINE" | "SHIELD" | "TELEPORT" | "DAMAGE",
): boolean;
```

**Tunables to add to `shared/types.ts`:**
```ts
export const FUEL_FIRE_BULLET = 5;
export const FUEL_FIRE_MISSILE = 25;
export const FUEL_MINE = 40;
export const FUEL_SHIELD_PER_SEC = 30;
export const FUEL_TELEPORT = 80;
```

**Rules:** damage debits the same pool; at `fuel <= 0` the tank dies. Self-elimination (ran-out-of-fuel-while-moving) does not award a kill — set `killerId=null` in the death event.

---

### P1-4. Landmines with ally-aware detonation + masked radar (TODO Phase 4)

**Files:**
- `server/src/sim/mines.ts` (new): `placeMine`, `stepMineDetonations`.
- `server/src/sim/vision.ts` (new): `computeVisionSet(tank, world)` returning `{ visibleTankIds, visibleMineIds, visibleProjectileIds }`.

**Mine masking rule (codify in `vision.ts`):**

```ts
/**
 * A mine is visible to viewer iff:
 *   1. viewer.tankId === mine.ownerId          (own mine)
 *   2. viewerTank.team === minePlacerTeam      (ally mine)
 *   3. mine was detected by viewer's radar in
 *      the last RADAR_DETECT_TICKS ticks       (revealed by sweep)
 * Otherwise the mine MUST be absent from the snapshot entirely — clients
 * must not be able to infer hidden mines from snapshot payload size.
 */
export function isMineVisible(
  mine: MineState,
  viewerTank: TankState,
  tankTeamByOwner: Map<string, TeamColor>,
  radarSweeps: Map<string, number>, // mineId -> lastDetectedTick
  currentTick: number,
): boolean;
```

**Tunables:**
```ts
export const MINE_RADIUS = 24;
export const MINE_DAMAGE = 250;
export const RADAR_DETECT_TICKS = 60;  // 3 sec at 20 Hz
```

**Wire-in:** `RoomLoop.buildSnapshotFor(connId)` (the P0-1.e stub) calls `computeVisionSet` and filters `mines` → `visibleMines` before emitting.

---

### P1-5. Persistent military rank ladder (TODO Phase 5)

**Files:**
- `server/src/sim/rank.ts` (new): `applyXpDelta(tank: Tank, delta: number): Tank`.
- Modify Prisma schema: change `Tank.rank` from `String` to a true enum once Prisma 6 is happy with it, OR add a runtime guard in `applyXpDelta` that throws if `tank.rank` is not in `MilitaryRank`.

**XP thresholds (single source of truth in `shared/types.ts`):**
```ts
export const RANK_XP_THRESHOLDS: Record<MilitaryRank, number> = {
  RECRUIT: 0,
  PRIVATE: 100,
  CORPORAL: 300,
  SERGEANT: 700,
  LIEUTENANT: 1500,
  CAPTAIN: 3000,
  MAJOR: 6000,
  COLONEL: 12000,
  GENERAL: 24000,
  COMMANDER: 50000,
};
```

**Rules:** kill = +25 XP, assist = +10, death = -15 (floor: cannot demote below `highestRank` shadow). `Tank.highestRank` ratchets monotonically upward.

**Endpoint:** `GET /leaderboard` returns top 20 by `highestRank` then `xp`.

---

## P2 — Hardening & polish

### P2-1. Reconnect & backoff
- `client/src/net.ts`: exponential backoff (500ms → 8s), preserve `clientTick` across reconnects.
- Server: 30s idle timeout per connection, ping/pong heartbeat at 5 Hz.

### P2-2. Vitest config + protocol test
- Add `vitest` to root devDeps.
- `server/src/__tests__/loop.test.ts` — drives `RoomLoop.tick()` 200 times, asserts deterministic snapshot output for fixed input sequence.
- Add `npm run test` script at root, wire into `ci.yml`.

### P2-3. Adopt `speedrungames-sdk`
- Add `"speedrungames-sdk": "github:Brynrg/speedrungames-sdk#v0.1.0"` to `client/package.json`.
- Replace `client/src/main.ts` debug HUD with the SDK's timer/leaderboard widget.

### P2-4. Spawn protection enforced server-side
- `TankState.isSpawnProtected` already exists; flip to true for `SPAWN_PROTECTION_MS=4000` after spawn; ignore inbound damage during the window.

### P2-5. Camera + map rendering
- `client/src/render.ts`: world→screen transform centered on local tank; draw map bounds, grid, tanks (hull + turret), projectiles, mines (only visible ones from snapshot), pickups.

---

## P3 — Future / nice-to-have

### P3-1. Sound + sprites + particles (TODO Phase 6)
- `client/public/assets/` for sprites; `client/src/audio.ts` for SFX.

### P3-2. Promote `MilitaryRank` to Prisma enum
- Currently `Tank.rank` is a `String`. Convert to a Prisma `enum` once the codebase is past Phase 5; requires a migration.

### P3-3. Match end → XP delta + home-page card
- Wire `applyXpDelta` into match-end event.
- Add the home-page card in `Brynrg/speedrungames` so `/games/tank-you-again` shows up in the site grid (TODO Phase 6).

### P3-4. Demotion policy decision
- TODO.md L118–119 flags "TBD: keep or drop demotion?". Pick one (recommend: drop demotion, keep `xp` floor at current-rank-threshold) and document.

### P3-5. Mine TTL
- TODO.md says mines have *no* TTL. Reconsider once playtest data exists — abandoned-mine pollution will probably need a cleanup pass.

### P3-6. Anti-cheat hooks
- Server already ignores client positions; add an `INPUT` rate-limit (max ~60 Hz/conn) and a `CHAT` rate-limit (max 1/sec).
