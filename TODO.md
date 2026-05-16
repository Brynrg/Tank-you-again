# Tank You Again — Build Plan

Server-authoritative 2D top-down multiplayer tank game. Clone of the 2006
Bonus.com / TankPit "Battlefield" experience, rebuilt on a modern stack and
deployed to free tiers end-to-end.

This file is the **living checklist**. Update boxes as work lands; keep the
spec sections accurate so future phases stay anchored to the same target.

---

## Stack & hosting

- **Monorepo**: npm workspaces — `shared/`, `server/`, `client/`.
- **Server**: Node 22 + Fastify + `@fastify/websocket` + `ws`. TS via `tsx` in
  dev, esbuild bundle in production. Hosted on **Fly.io** (free tier:
  shared-cpu-1x, 256 MB, auto-stop on idle, native WebSocket support).
- **Client**: Vite + TypeScript + HTML5 Canvas (hand-rolled, no game engine).
  Built and synced to **speedrungames.net/games/tank-you-again** via the
  existing Netlify pipeline.
- **DB**: Prisma + **Neon Postgres** (free tier: 0.5 GB, autoscale-to-zero).
  Local dev points at a Neon dev branch or a Docker Postgres.
- **Shared**: `shared/types.ts` is the single source of truth for protocol
  structs, enums, tunables. Imported everywhere via `@shared/types`.

---

## Specification

### Account & guest flow

- Guests join with a chosen display name. Server validates against the
  alphanumeric `validateUsername` regex (`[A-Za-z0-9_-]{3,16}`). A guest `User`
  row is created with `isGuest=true` and a `Tank` row at rank `RECRUIT`.
- Registered users authenticate with username + bcrypt-hashed password.
  Passwords are 8–72 bytes; `bcryptjs` at cost 12. Their `Tank` profiles
  persist rank, XP, kills, deaths, matches, fuel-used, damage, and highest
  rank ever reached.
- Guest rows are reaped after N days of inactivity; registered rows persist
  indefinitely.

### Authoritative server room loop

- Fixed timestep at **20 Hz** (50 ms per tick).
- Single hot loop per room: ingest inputs → simulate physics → resolve
  collisions → pick item drops → emit per-client snapshots → persist deltas.
- Client inputs are buffered and applied to the tick the server is currently
  simulating; late inputs are dropped, never rewound.
- Per-client snapshots are tailored (see "masked radar" below) — the server
  never broadcasts the raw world state.

### 8-way movement

- Hull rotation snaps to 8 cardinal/intercardinal directions (45° steps).
- Turret rotates freely and is decoupled from hull.
- Movement consumes fuel each tick the tank is in motion.
- Diagonal motion costs the same fuel/sec as cardinal (no √2 cheese).

### Fuel-as-health economy

In TankPit, **fuel doubles as the health bar** — there is no separate HP
stat. Every cost below is debited from the same pool:

| Action          | Fuel cost                        |
| --------------- | -------------------------------- |
| Idle            | 0                                |
| Move (any dir)  | drain per tick                   |
| Fire bullet     | small fixed cost                 |
| Fire missile    | larger fixed cost                |
| Place mine      | medium fixed cost                |
| Activate shield | drain while active               |
| Teleport        | flat charge per use              |
| **Take damage** | **fuel deducted = damage value** |

- Fuel is replenished by `FUEL_CRATE` pickups only — no passive regen.
- At zero fuel the tank explodes (counts as a death for kill credit).
- A non-zero-fuel tank that runs out of fuel _without_ being hit also dies,
  attributed as a self-elimination (no kill credit).

### Landmine logic

- Mines are placed at the tank's current position (minus a small spawn
  offset so a tank can't immediately self-detonate).
- Mine cost is debited from fuel at placement.
- Mines persist on the map until detonated. They have no time-to-live.
- Detonation triggers when any enemy tank's hitbox overlaps the mine's
  trigger radius. Allies (same team) walk over their own mines without
  triggering them.
- Mines damage all tanks (including allies) within the explosion radius.
- A tank that places a mine and dies still owns those mines — they keep
  exploding under enemy contact until cleared.

### Masked radar snapshot pipeline

For each connected client, on every server tick the room:

1. Builds the full world snapshot in-process.
2. Computes the client's **vision set**: own tank, allies, enemies within
   line-of-sight or active radar pings.
3. Filters `tanks` and `projectiles` to entities in the vision set.
4. Filters `pickups` to those within map vision.
5. **Mine masking**: only includes mines that are (a) placed by this client,
   (b) placed by an ally on the same team, or (c) detected via radar sweep
   in the last `RADAR_DETECT_TICKS` ticks. All other mines are excluded
   entirely — clients must not be able to infer hidden mines from snapshot
   payload size.
6. Emits the masked `GameStateSnapshot`.

### Persistent military rank ladder

Ranks in order:

`RECRUIT → PRIVATE → CORPORAL → SERGEANT → LIEUTENANT → CAPTAIN → MAJOR → COLONEL → GENERAL → COMMANDER`

- Promotion thresholds are XP gates. XP is earned for kills, capture
  events, and assists; lost on death (with a floor so you never demote
  below your `highestRank` shadow rank).
- `Tank.highestRank` only ratchets upward; current `rank` can demote on
  long losing streaks (TBD: keep or drop demotion?).
- `COMMANDER` is leaderboard-visible and per-server (not per-room).

---

## Hosting & deploy

- **Frontend** → built by `.github/workflows/deploy-frontend.yml` on every
  push that touches `client/` or `shared/`. Sync target is
  `Brynrg/speedrungames` at `apps/web/public/games/tank-you-again/`, served
  by Netlify under [speedrungames.net/games/tank-you-again](https://speedrungames.net/games/tank-you-again).
  Token lives in this repo as `SPEEDRUNGAMES_TOKEN`.
- **Backend** → built and shipped by `.github/workflows/deploy-backend.yml`
  to Fly.io. One-time setup:
  1. `fly launch --no-deploy --copy-config` from the repo root.
  2. `fly secrets set DATABASE_URL="postgresql://…@neon.tech/tankpit?sslmode=require"`.
  3. `flyctl auth token` → store as the `FLY_API_TOKEN` GitHub secret.
  4. Workflow runs `flyctl deploy --remote-only` on every push to
     `server/`, `shared/`, `Dockerfile`, or `fly.toml`.
- **Database** → Neon free tier. Schema lives in `server/prisma/schema.prisma`.
  `npm run db:test` proves connectivity; `npm run db:push` applies the schema
  (use a dev branch for local pushes — don't push to prod from a laptop).

---

## Phases

### Phase 1 — Repo bootstrap ✅

- [x] Monorepo layout (`shared/`, `server/`, `client/`).
- [x] Root `package.json` with npm workspaces + `dev` script (concurrently).
- [x] Root `tsconfig.json` is the single source of truth for compiler options
      and defines the `@shared/*` path alias. Sub-workspaces extend it.
- [x] `shared/types.ts` with enums (`TeamColor`, `MilitaryRank`, `ItemType`)
      and interfaces (`TankState`, `ProjectileState`, `MineState`,
      `PickupState`, `GameStateSnapshot`), plus protocol messages and tunables.
- [x] `server/` — Fastify + `@fastify/websocket` + `ws` + Prisma + bcryptjs.
      Prisma schema for `User` and `Tank` (postgresql provider, xp + rank +
      stats fields). Validation utility (`server/src/lib/validation.ts`) and
      bcrypt password util (`server/src/lib/password.ts`).
- [x] `client/` — Vite + TS + Canvas. `index.html` mounts a `#game` canvas;
      `src/main.ts` is the engine entry point. `vite.config.ts` mirrors the
      tsconfig `@shared/*` alias.
- [x] `dotenv` wired into `server/src/index.ts`; PORT/HOST safely default in
      code if `.env` is absent.
- [x] Root `.env.example` and `server/.env.example` document `PORT`, `HOST`,
      `DATABASE_URL` (Neon connection string format).
- [x] `scripts/test-db-connection.ts` (`npm run db:test`) verifies TCP
      reachability and Prisma round-trip against the configured Neon URL.
- [x] Server prod build is an esbuild bundle (resolves `@shared/*` at build
      time so the runtime doesn't need TS path-alias support).
- [x] `Dockerfile` + `fly.toml` for Fly.io deployment.
- [x] `.github/workflows/deploy-frontend.yml` (mirrors app-tower-game
      sync pattern; uses `SPEEDRUNGAMES_TOKEN`).
- [x] `.github/workflows/deploy-backend.yml` (Fly.io deploy; needs
      `FLY_API_TOKEN` one-time secret).
- [x] `.prettierrc` + `.prettierignore` at root. `npm run format` writes,
      `npm run format:check` verifies. Prettier 3 across all workspaces.
- [x] Everything compiles (`npm run typecheck` clean) and is formatted.

### Phase 2 — Networking spine

- [ ] WS handshake with `AUTH` message (token or guest name); username goes
      through `validateUsername`.
- [ ] Server emits `WELCOME` with `yourTankId`, `tickRate`, map dims.
- [ ] Client sends `INPUT` at the client's frame rate; server clamps to its
      own tick.
- [ ] Server emits `SNAPSHOT` at 20 Hz; client renders the latest snapshot.
- [ ] Connection drop & reconnect handling (server timeout, client backoff).
- [ ] First Fly.io deploy succeeds; first Neon connection from production
      verified.

### Phase 3 — Movement & rendering MVP

- [ ] Hull + turret render on canvas.
- [ ] 8-way movement with fuel drain.
- [ ] Camera follows local tank.
- [ ] Minimum-viable map: solid bounding rect, debug grid.

### Phase 4 — Combat (fuel-as-health)

- [ ] Bullets + missiles with server-side hit detection.
- [ ] Damage debits the target's fuel; at zero, explosion + death event.
- [ ] Mines (placement, ally pass-through, detonation, masking).
- [ ] Shield + teleport item activations.
- [ ] Spawn protection enforced server-side.

### Phase 5 — Persistence & rank

- [ ] Match end → XP deltas computed → `Tank` row updated.
- [ ] `Tank.highestRank` ratchet.
- [ ] Leaderboard endpoint (top N by `highestRank`, then `xp`).

### Phase 6 — Polish & ship

- [ ] Auth flow (registered + guest) wired end-to-end.
- [ ] Sound, sprites, particle effects.
- [ ] Add the home-page card on `Brynrg/speedrungames` so
      `/games/tank-you-again` shows up in the site grid.

---

## Local dev quickstart

```bash
npm install
cp .env.example .env             # then edit DATABASE_URL with Neon string
npm run db:test                  # confirm Neon is reachable
npm run db:push                  # apply schema (use a Neon dev branch!)
npm run dev                      # client on :5173, server on :3001
```

`npm run typecheck` runs TypeScript across all three workspaces.
`npm run format` / `format:check` runs Prettier across the repo.
