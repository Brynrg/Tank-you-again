# Tank You Again — Completion Status

> Refined status doc for AI agents working on `brynr-builds/Tank-you-again`. Generated 2026-05-19 from a full source read of every file in the repo (33 blobs at HEAD `main`).

**Score:** 24 / 100 — bootstrap is genuinely solid (infra, CI, types, schema), but the game is ~0% built. The room loop, snapshot pipeline, and authoritative state do not exist yet.
**Phase per TODO.md:** Phase 1 ✅ complete, Phase 2 ❌ not started.
**Stack:** TypeScript monorepo (npm workspaces — `shared/`, `server/`, `client/`). Server = Fastify 5 + `@fastify/websocket` v11 + Prisma 6 on Node 22 / Fly.io shared-cpu-1x. Client = Vite 6 + hand-rolled Canvas (no engine). DB = Neon Postgres. Shared types via `@shared/*` path alias.
**Deploy target:** `Brynrg/speedrungames` at `apps/web/public/games/tank-you-again/`, served from `speedrungames.net/games/tank-you-again`.

---

## Architecture

```
┌────────────────────────────┐         ws://…/ws         ┌────────────────────────────┐
│  client/src/main.ts        │  ─────────────────────▶   │  server/src/index.ts       │
│  (Vite + Canvas, 65 lines) │  ◀───── WELCOME ─────     │  Fastify + @fastify/ws     │
│                            │  ◀───── echo (TODO       │  (50 lines, no game loop)  │
│  draws placeholder frame   │         SNAPSHOT)         │                            │
│  reads VITE_WS_URL         │                           │  prisma → Neon Postgres    │
└────────────────────────────┘                           └────────────────────────────┘
            │                                                       │
            │ build → npx vite build --base=/games/tank-you-again/  │ flyctl deploy
            ▼                                                       ▼
   Brynrg/speedrungames repo (Netlify, /games/tank-you-again/)   tank-you-again.fly.dev
            │
            │ shared types resolved at build time via @shared/* alias
            ▼
  shared/types.ts ── single source of truth for protocol + tunables
                     (TankState, GameStateSnapshot, ClientMessageType,
                      SERVER_TICK_RATE=20, MAP_WIDTH/HEIGHT=2048, MAX_FUEL=1000)
```

### Workspace layout

| Path                              | Role                                                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| `shared/types.ts`                 | Protocol structs, enums, tunables. Imported via `@shared/types`.     |
| `server/src/index.ts`             | Fastify boot, `/health`, `/ws` handler. **No room loop, no state.**  |
| `server/src/lib/password.ts`      | bcryptjs cost-12 hash/verify.                                        |
| `server/src/lib/validation.ts`    | `validateUsername`, `sanitizeChat`, `validatePassword`, `Validation<T>` discriminated result. |
| `server/prisma/schema.prisma`     | `User` + `Tank` models with persistent XP/rank/stats.                |
| `client/src/main.ts`              | Canvas placeholder + WS connect. No input capture, no render of any game entity. |
| `client/index.html`               | 1024×768 canvas, dark theme.                                         |
| `client/vite.config.ts`           | Mirrors `@shared/*` alias; ES2022 target.                            |
| `scripts/test-db-connection.ts`   | TCP + Prisma round-trip probe (`npm run db:test`).                   |
| `Dockerfile`                      | Two-stage Node-22-slim build with esbuild bundle, Prisma client gen. |
| `fly.toml`                        | shared-cpu-1x / 256MB / auto-stop / native WS on port 3001.          |
| `.github/workflows/deploy-backend.yml`  | flyctl deploy on `server/`, `shared/`, `Dockerfile`, `fly.toml`. |
| `.github/workflows/deploy-frontend.yml` | Build client, sync into `Brynrg/speedrungames` `/games/tank-you-again/`. |

### Protocol (already declared in `shared/types.ts`)

- Client → Server: `AUTH` (token or guestName), `INPUT` (up/down/left/right + aim radians + clientTick), `USE_ITEM`, `FIRE`, `PLACE_MINE`, `TELEPORT`, `CHAT` *(enum entries exist; only `AUTH`/`INPUT` have concrete interfaces defined)*.
- Server → Client: `WELCOME` (yourTankId, serverTickRate, map dims), `SNAPSHOT` (`GameStateSnapshot`), `EVENT`, `ERROR` *(`WELCOME`/`SNAPSHOT` interfaces defined; `EVENT`/`ERROR` enum-only)*.
- Snapshot shape: `{ tick, timestamp, tanks[], projectiles[], pickups[], visibleMines[] }` — note `visibleMines` is the masking lane (mines a client is allowed to see).
- Tunables: `SERVER_TICK_RATE=20`, `MAP_WIDTH=MAP_HEIGHT=2048`, `MAX_FUEL=1000`, `SPAWN_PROTECTION_MS=4000`.

---

## What works — by file, by line

### `server/src/index.ts` (50 lines)
- L1–5: imports (`dotenv/config`, Fastify, websocket plugin, PrismaClient, shared types).
- L7–8: `prisma` + `app` (Fastify with logger) instantiated.
- L10: `await app.register(websocket)` — global plugin registration.
- L12: `GET /health` returns `{ status: "ok", tickRate: 20 }`.
- L17–39: WS route registered **inside a nested plugin scope** (per L14–16 comment, `@fastify/websocket` v11 requires this — outside a scope the upgrade middleware never wires).
- L21–28: Sends `WELCOME` with `yourTankId="pending"` and `mapWidth/Height=0` — placeholder values, not driven by any room state.
- L30–33: Inbound `message` handler **echoes raw frames back** — Phase-1 pipe verifier, no AUTH parsing, no input ingestion.
- L41–50: `app.listen({port, host})` on `3001` / `0.0.0.0`, exits non-zero on bind failure after `prisma.$disconnect()`.

### `client/src/main.ts` (65 lines)
- L7–10: Grabs `#game` canvas + 2D context (hard-throws if absent).
- L12–13: Holds two pieces of state — `lastServerTick` and `connectionStatus`.
- L15–33: `draw()` paints a dark frame + "Tank You Again" title + a one-line debug HUD (tickRate / ws state / lastTick).
- L35–62: `connect()` opens `VITE_WS_URL || ws://localhost:3001/ws`, parses inbound JSON, increments `lastServerTick` on `SNAPSHOT`, redraws on every event.
- L64–65: Initial paint + connect on load. **No animation frame loop, no input capture, no canvas resize handling, no reconnect logic.**

### `shared/types.ts` (164 lines)
- Full enums (`TeamColor`, `MilitaryRank` 10-rank ladder, `ItemType`).
- Full game-state structs (`TankState`, `ProjectileState`, `MineState`, `PickupState`, `GameStateSnapshot`, `AmmoCounts`).
- Protocol message unions (`ClientMessage`, `ServerMessage`) — but only `AUTH`/`INPUT`/`WELCOME`/`SNAPSHOT` have concrete interfaces. `USE_ITEM`, `FIRE`, `PLACE_MINE`, `TELEPORT`, `CHAT`, `EVENT`, `ERROR` are enum entries with no struct.
- Tunables block at L159–164.

### `server/src/lib/validation.ts`
- `validateUsername` (regex `^[A-Za-z0-9_-]{3,16}$`), `sanitizeChat` (200-char cap, drops non-`\p{L}\p{N}\s.,!?'"\-`), `validatePassword` (>=8 chars, <=72 bytes).
- Returns `Validation<T> = { ok: true; value: T } | { ok: false; reason: string }`.

### `server/src/lib/password.ts`
- bcryptjs `hash` / `compare` at cost 12.

### `server/prisma/schema.prisma`
- `User`: id (cuid), username (nullable unique), passwordHash, isGuest, createdAt, lastSeenAt. Indexed on `isGuest`, `lastSeenAt`.
- `Tank`: id, name, userId (FK), `rank` String default `"RECRUIT"`, `xp`, `kills`, `deaths`, `matchesPlayed`, `totalFuelUsed`, `totalDamage`, `highestRank`. Indexed on `userId`, `rank`, `kills`.
- **Note:** `rank` is a `String` not an enum — relies on app-layer enforcement via `MilitaryRank`.

### CI / infra
- `deploy-backend.yml`: filtered to `server/**`, `shared/**`, `Dockerfile`, `fly.toml`, root `package.json`/`package-lock.json`/`tsconfig.json`, and its own workflow file. Uses `superfly/flyctl-actions/setup-flyctl@master`, requires `FLY_API_TOKEN`. No build step in CI — `flyctl deploy --remote-only` does it remote.
- `deploy-frontend.yml`: filtered to `client/**`, `shared/**`, root config. Installs deps, **runs `npm run typecheck --workspace=client`**, runs `npx vite build --base=/games/tank-you-again/`, checks `dist/index.html` + `dist/assets` exist, then clones `Brynrg/speedrungames` (using `SPEEDRUNGAMES_TOKEN`), wipes `apps/web/public/games/tank-you-again/`, copies `client/dist/.` in, commits + pushes if diff.
- `Dockerfile`: two-stage — build stage installs all workspaces, runs `prisma generate`, `npm run build --workspace=server` (esbuild bundle). Runtime stage carries `node_modules`, `server/dist`, `server/prisma`, and the package manifests. `CMD ["node", "server/dist/index.js"]`.
- `fly.toml`: app `tank-you-again`, region `iad`, port 3001, force HTTPS, auto-stop, `min_machines_running=0`. Native WS supported by Fly's HTTP service.

---

## Known gaps (priority-ordered)

1. **No game loop.** There is no file resembling `loop.ts`, `room.ts`, `world.ts`, or anything that calls `setInterval`/`setImmediate` at 20 Hz. `SNAPSHOT` is never emitted by the server. The client never receives one in practice (the `lastTick` HUD field will sit at 0 forever).
2. **WS handler is an echo stub.** L30–33 of `server/src/index.ts` echoes any inbound frame as text. No `AUTH` parsing, no `INPUT` ingestion, no per-connection tank registration.
3. **No `speedrungames.json` manifest** at `client/public/`. The Brynrg/speedrungames umbrella looks for a per-game manifest to drive its catalog; absent it, the game won't auto-appear in the home grid (the existing live game at `/games/tank-you-again/` is a placeholder static `index.html` with no manifest — see the `backfilled: true / backfillNotes: ... True upstream source repo provenance unknown` flag in the umbrella's backfilled manifest for `tower-wars` for analogous evidence).
4. **No `pnpm typecheck && pnpm build` CI gate.** Root has no `ci.yml`. The only typecheck currently runs inside `deploy-frontend.yml` (and only for `client/`). Server / shared / scripts typecheck never runs in CI.
5. **No Vitest / tests.** Zero test files in the repo.
6. **Client never sends `AUTH`.** Even with the WS open, no auth handshake happens — the server's `yourTankId="pending"` placeholder is a tell.
7. **No reconnect / backoff** in client; one disconnect = dead session.
8. **No input capture** (keydown/mousemove). Client cannot drive anything.
9. **No render of tanks / map / camera** — `draw()` is just text.
10. **No room / lobby / matchmaking** primitives.
11. **`Tank.rank` is `String` not enum** — schema-side enforcement is missing, app-side `MilitaryRank` enum is informal.
12. **Mine masking pipeline (`visibleMines`)** unimplemented; no LOS/radar code.
13. **8-way snap, fuel-as-health, landmine ally-aware detonation, masked radar, rank ladder, XP gates** — all spec'd in TODO.md, none built.
14. **No `speedrungames-sdk`** dependency. The umbrella expects games to consume it for timer/HUD/leaderboard.

---

## Hot paths

These are the files an AI agent will modify most while building Phases 2–4. Memorize them.

| Hot path                          | Why                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `server/src/index.ts`             | Currently the entire server. Needs to be split: `index.ts` (boot) → `room.ts` / `loop.ts` (sim). |
| `shared/types.ts`                 | Every protocol change ripples through both ends. Add new message structs HERE first, then implement. |
| `client/src/main.ts`              | Needs to fan out: `net.ts` (WS), `input.ts` (keyboard/mouse), `render.ts` (canvas), `loop.ts` (rAF). |
| `server/prisma/schema.prisma`     | Touched only when adding Match / Round / KillEvent rows in Phase 5.                            |
| `.github/workflows/`              | Add `ci.yml` (typecheck + build gate) — see IMPROVEMENT_PLAN.md P0-3.                          |

---

## Notes for AI agents

- **Run order for local dev:** `npm install` → `cp .env.example .env` → fill `DATABASE_URL` → `npm run db:test` → `npm run db:push` → `npm run dev`. Server boots on `3001`, client on `5173`.
- **Build command in CI is `npx vite build --base=/games/tank-you-again/`**, not `npm run build`. Anything you add to `client/dist/` will land in the umbrella site. Anything you fail to add (e.g. `speedrungames.json` not in `client/public/`) will be missing.
- **Server bundle is esbuild ESM, `--packages=external`** — runtime requires `node_modules` to be present in the container, which Dockerfile copies. Don't import anything you can't `npm install`.
- **Path alias `@shared/*`** is resolved at three layers: root `tsconfig.json`, `client/vite.config.ts`, and the esbuild server bundle (which inlines shared code at build time). When adding new shared modules, prefer keeping them in `shared/types.ts` until the file gets unwieldy — splitting requires updating all three layers.
- **`@fastify/websocket` v11 quirk** (already handled at L17 of `server/src/index.ts`): WS routes MUST be registered inside a nested `app.register(async (scope) => { scope.get("/ws", { websocket: true }, ...) })` plugin scope. Don't move the route out of the scope or upgrades silently break.
- **Authoritative-server invariant:** never trust client positions, velocities, or fuel. All state mutation happens on the server tick. The client sends *intent* (`INPUT.up/down/left/right`, `aim`) and consumes *truth* (`SNAPSHOT`).
- **`noUncheckedIndexedAccess: true`** is on in root `tsconfig.json` — array/record accesses come back as `T | undefined`. Plan for it when adding loops.
- **Prettier 3, 100-col, double-quote, semi, trailing-all.** Match the existing style or `format:check` will fail.
- **`scripts/tsconfig.json` exists** and is included in the root `typecheck` script — any new scripts under `scripts/` are typechecked.
- **The `npm` workspace uses `npm`, NOT `pnpm`** — the original COMPLETION_STATUS.md and TODO.md mention `pnpm` in places but `package.json` and CI are all `npm`. When task descriptions say "pnpm typecheck", read as `npm run typecheck`.
