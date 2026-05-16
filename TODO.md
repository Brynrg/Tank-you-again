# Tank You Again — Build Plan

Server-authoritative 2D top-down multiplayer tank game. Clone of the 2006
Bonus.com / TankPit "Battlefield" experience, rebuilt on a modern stack.

This file is the **living checklist**. Update boxes as work lands; keep the
spec sections accurate so future phases stay anchored to the same target.

---

## Stack

- **Monorepo**: npm workspaces — `shared/`, `server/`, `client/`.
- **Server**: Node + Fastify + `@fastify/websocket` + `ws`. TS via `tsx` in dev.
- **Client**: Vite + TypeScript + HTML5 Canvas (no game engine; hand-rolled).
- **DB**: Prisma + SQLite locally; postgres-ready for staging/prod.
- **Shared**: `shared/types.ts` is the single source of truth for protocol
  structs, enums, and tunables.

---

## Specification

### Account & guest flow

- Guests join with a chosen display name. Server creates a `User` row with
  `isGuest=true` and a `Tank` row at rank `RECRUIT`.
- Registered users authenticate with username + password. Their `Tank`
  profiles persist rank, kills, deaths, matches, fuel-used, damage, and the
  highest rank ever reached.
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

### Fuel-cost economy

| Action            | Fuel cost                |
| ----------------- | ------------------------ |
| Idle              | 0                        |
| Move (any dir)    | drain per tick           |
| Fire bullet       | small fixed cost         |
| Fire missile      | larger fixed cost        |
| Place mine        | medium fixed cost        |
| Activate shield   | drain while active       |
| Teleport          | flat charge per use      |

- Fuel is replenished by `FUEL_CRATE` pickups only — no passive regen.
- A tank at zero fuel cannot move, fire, place mines, or teleport. It can
  still be killed; this is intentional.

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

Ranks (in order):

`RECRUIT → PRIVATE → CORPORAL → SERGEANT → LIEUTENANT → CAPTAIN → MAJOR → COLONEL → GENERAL → COMMANDER`

- Promotion thresholds are kill-count gates, scaled by deaths (K/D-weighted).
- `Tank.highestRank` only ratchets upward; current `rank` can demote on long
  losing streaks (TBD: keep or drop demotion?).
- `COMMANDER` is leaderboard-visible and per-server (not per-room).

---

## Phases

### Phase 1 — Repo bootstrap ✅

- [x] Monorepo layout (`shared/`, `server/`, `client/`).
- [x] Root `package.json` with npm workspaces + `dev` script (concurrently).
- [x] `tsconfig.base.json` shared by all three workspaces.
- [x] `shared/types.ts` with enums (`TeamColor`, `MilitaryRank`, `ItemType`)
      and interfaces (`TankState`, `ProjectileState`, `MineState`,
      `PickupState`, `GameStateSnapshot`), plus protocol messages and tunables.
- [x] `server/` — Fastify + `@fastify/websocket` + `ws` + Prisma. Prisma
      schema for `User` and `Tank` with rank/stats fields.
- [x] `npx prisma db push` runs cleanly against local SQLite.
- [x] `client/` — Vite + TS + Canvas. `index.html` mounts a `#game` canvas;
      `src/main.ts` is the engine entry point.
- [x] Everything compiles (`npm run typecheck` clean).

### Phase 2 — Networking spine

- [ ] WS handshake with `AUTH` message (token or guest name).
- [ ] Server emits `WELCOME` with `yourTankId`, `tickRate`, map dims.
- [ ] Client sends `INPUT` at the client's frame rate; server clamps to its
      own tick.
- [ ] Server emits `SNAPSHOT` at 20 Hz; client renders the latest snapshot.
- [ ] Connection drop & reconnect handling (server timeout, client backoff).

### Phase 3 — Movement & rendering MVP

- [ ] Hull + turret render on canvas.
- [ ] 8-way movement with fuel drain.
- [ ] Camera follows local tank.
- [ ] Minimum-viable map: solid bounding rect, debug grid.

### Phase 4 — Combat

- [ ] Bullets + missiles with server-side hit detection.
- [ ] Mines (laid, persistent, masked from non-owners as per radar pipeline).
- [ ] Shield + teleport item activations.
- [ ] Spawn protection enforced server-side.

### Phase 5 — Persistence & rank

- [ ] Match end → rank deltas computed → `Tank` row updated.
- [ ] `Tank.highestRank` ratchet.
- [ ] Leaderboard endpoint (top N by `highestRank`, then `kills`).

### Phase 6 — Polish & deploy

- [ ] Auth flow (registered + guest).
- [ ] Sound, sprites, particle effects.
- [ ] CI build + auto-deploy to `speedrungames.net/games/tank-you-again` via
      the existing GitHub Actions sync pipeline.

---

## Local dev quickstart

```bash
npm install
npm run db:push       # initialise server/prisma/dev.db
npm run dev           # client on :5173, server on :3001
```

`npm run typecheck` runs TypeScript across all three workspaces and should
exit 0.
