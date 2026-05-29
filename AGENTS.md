# AGENTS.md — Tank You Again

> **Read this before touching the code.** This is the single source of truth
> for AI agents (and humans) working on `Brynrg/Tank-you-again`. It assumes
> you also know the portal-wide contract at
> [`Brynrg/speedrungames/AGENTS.md`](https://github.com/Brynrg/speedrungames/blob/main/AGENTS.md);
> when the two conflict, this file wins for game-internal questions and the
> portal AGENTS.md wins for "how does this game appear in the catalog."

## What this repo is

Server-authoritative 2D top-down multiplayer tank arena, deployed to
`https://speedrungames.net/games/tank-you-again/`.

```
client/  → Vite + Canvas client. Built and synced into the speedrungames portal.
server/  → Fastify + @fastify/websocket on Fly.io. Authoritative 20 Hz room loop.
shared/  → Protocol structs, enums, tunables. Imported by both client and server.
scripts/ → Build helpers + DB connectivity probe. Typechecked by CI.
```

Deploy targets:

- Frontend → `Brynrg/speedrungames/apps/web/public/games/tank-you-again/` (Netlify)
- Backend → `tank-you-again.fly.dev` (Fly.io, free tier, shared-cpu-1x, auto-stop)
- Database → Neon Postgres (free tier, autoscales to zero)

### How the frontend deploys (read before touching deploy)

Push to `main` → [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
builds the client and calls the **portal's reusable workflow**
(`Brynrg/speedrungames/.github/workflows/deploy-game.yml`), which runs the
canonical ingest and opens an **auto-merging portal PR**. That is the only way
the client reaches the live site.

> ❌ **Never** `cp` `client/dist` (or `dist/`) into the speedrungames portal,
> and never hand-edit `apps/web/public/games/tank-you-again/`. Doing exactly
> that once buried the build in a `dist/` subfolder and shipped a "no visible
> change" deploy. To deploy: **push**, or run the portal's
> `scripts/ingest-game-build.mjs` — never copy files.

## The contract — what you must do

### Before you push

Run these locally; CI runs the same set and will refuse to deploy if any fail:

```bash
npm ci
npx prisma generate --schema=server/prisma/schema.prisma
npm run typecheck     # tsc across shared/, server/, client/, scripts/
npm test              # Vitest room-loop determinism + sim tests
npm run build         # esbuild server bundle + Vite client + stage dist/
npm run format:check  # Prettier 3, 100-col, double-quote, semi, trailing-all
```

If any of those fail, the deploy gate
([`.github/workflows/ci-and-deploy.yml`](./.github/workflows/ci-and-deploy.yml))
will block your push from reaching production. The live game stays on the last
green build — fail-safe by default.

### Pushing

```bash
git push origin main
```

That's it. The single workflow at `.github/workflows/ci-and-deploy.yml`:

1. Runs `ci` (the checks above).
2. If `ci` passes AND `server/` / `shared/` / `Dockerfile` / `fly.toml` changed
   → `deploy-backend` ships a new Fly image.
3. If `ci` passes AND `client/` / `shared/` changed
   → `deploy-frontend` builds the Vite bundle and commits it into the portal.

Total time: ~1–2 min. The job graph + path filters are in the YAML; trust them.

### Conventions

- **Style:** Prettier 3, 100-col, double-quote, semi, trailing-all. Match
  existing files. `npm run format` fixes drift.
- **`noUncheckedIndexedAccess: true`** is on. Plan for `T | undefined` from
  any array / Map read.
- **Path alias `@shared/*`** resolves to `shared/*`. Use it everywhere — never
  reach for relative paths into `shared/`.
- **The package manager is `npm`** (npm workspaces), not pnpm. Some older
  docs in this repo say "pnpm"; treat as legacy.
- **Server modules use ESM with `.js` import extensions** even though the
  source is `.ts` (esbuild ESM convention). Match the existing imports.

## The guarantees — what the pipeline catches for you

| Class of mistake                                                  | Caught by                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| TypeScript error anywhere                                         | `npm run typecheck` (CI) + Vite client build + esbuild server build     |
| Sim regression (movement, fuel drain, fire cooldown, determinism) | `npm test` (CI)                                                         |
| Format drift                                                      | `npm run format:check` (CI)                                             |
| Schema change without DB migration                                | Backend deploy refuses with a clear error                               |
| Server boot failure                                               | Fly's health-check rolling deploy keeps the previous image running      |
| Bundle that references `localhost` or absolute-root `/assets`     | Portal's `ingest-game-build.mjs` broken-path scanner (when ingest runs) |
| Frontend deploy step fails                                        | Live game stays on the previous build; nothing half-ships               |

## Hot paths — where to make what kind of change

| Change you want to make                              | Files to edit                                                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Game balance (speed, damage, fuel costs, XP rewards) | `shared/types.ts` tunables block — single source of truth, both ends pick it up                                                                                                          |
| New weapon or item                                   | `shared/types.ts` (enum + tunables) → `server/src/sim/combat.ts` → `server/src/loop.ts` (dispatch) → `client/src/render.ts` (visual)                                                     |
| Movement / physics tweak                             | `server/src/sim/movement.ts` only — client never simulates                                                                                                                               |
| Mine / radar behavior                                | `server/src/sim/mines.ts`, `server/src/sim/vision.ts`                                                                                                                                    |
| Rank ladder                                          | `server/src/sim/rank.ts` and `RANK_XP_THRESHOLDS` in `shared/types.ts`                                                                                                                   |
| HUD / camera / sprite                                | `client/src/render.ts`, `client/src/loop.ts`                                                                                                                                             |
| Input bindings                                       | `client/src/input.ts`                                                                                                                                                                    |
| New protocol message                                 | **Add the interface to `shared/types.ts` first**, then server dispatch in `server/src/index.ts` and `server/src/loop.ts`, then client send in `client/src/loop.ts` / `client/src/net.ts` |
| Auth flow (register users, sessions)                 | `server/src/auth.ts` and `server/prisma/schema.prisma`                                                                                                                                   |
| Database schema                                      | `server/prisma/schema.prisma` — **see footgun #1 below**                                                                                                                                 |

## Footguns — these will break the game

1. **Prisma schema changes need a manual migration.** If you edit
   `server/prisma/schema.prisma`, the workflow will **refuse to deploy** the
   backend until you run:

   ```bash
   DATABASE_URL='<your Neon connection string>' \
     npx prisma db push --schema=server/prisma/schema.prisma
   ```

   Then re-run the workflow from the Actions tab. Skipping this would deploy
   a server that crashes on the first query.

2. **Protocol changes must land on both sides in the same push.** `client/`
   and `server/` deploy through different pipelines and finish at slightly
   different times (~30 sec gap). For a hobby game, this is fine — a quick
   reload after a deploy reconciles any mismatch. If you add fields that
   _require_ both ends to agree (e.g. new SNAPSHOT structure), test
   backward-compat: the OLD client should still work against the NEW server
   for the duration of the deploy gap.

3. **The client must NEVER simulate authoritatively.** All state mutation
   happens server-side in `RoomLoop.tick()`. The client sends _intent_
   (INPUT, FIRE, PLACE*MINE) and consumes \_truth* (SNAPSHOT). Adding
   client-side prediction without server reconciliation = cheating window.

4. **Don't bundle node-only modules into client code.** `node:crypto`,
   `fs`, `prisma`, etc. are server-side. The Vite build will fail if you do
   this — but if you bypass the build (e.g., by hand-editing `dist/`),
   nothing will catch it.

5. **`@fastify/websocket` v11 quirk.** WS routes must be registered inside a
   nested `app.register(async (scope) => { ... })` block. Outside that scope
   the upgrade middleware silently doesn't wire. The existing code at
   `server/src/index.ts:67` is correct — don't refactor it out of the scope.

6. **No external CDNs without a vendored fallback.** The portal's broken-path
   scanner will flag `googleapis.com`, `localhost`, etc. Self-host any new
   asset under `client/public/`.

7. **`server/.env` is gitignored.** Never commit it. CI gets `DATABASE_URL`
   from the Fly secret at deploy time. Local dev reads `server/.env` (created
   from `.env.example` via `postinstall`).

## Required final report (every non-trivial run)

When you finish a unit of work, return:

- **Summary** — one sentence on what changed.
- **Files changed** — grouped by `server/`, `client/`, `shared/`, `scripts/`, root config.
- **Validation results** — output of typecheck / test / build / format (or "skipped — N/A").
- **Manual steps required** — if any (e.g., "run prisma db push").
- **Next recommended step** — the smallest follow-up.

## Cross-references

- [`AGENTS.md`](https://github.com/Brynrg/speedrungames/blob/main/AGENTS.md) — the umbrella portal contract; binding for catalog / manifest / ingest concerns.
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — one-time infra setup (Neon, Fly), every-push pipeline, troubleshooting, rollback, cost ceiling.
- [`COMPLETION_STATUS.md`](./COMPLETION_STATUS.md) — current state of the game; written for cold-read by future agents.
- [`IMPROVEMENT_PLAN.md`](./IMPROVEMENT_PLAN.md) — executable backlog of P0/P1/P2 tasks.
- [`TODO.md`](./TODO.md) — original 6-phase build plan; some sections now historical (Phase 1 done, Phases 2-6 shipped). Treat as design spec, not active checklist.
- [`ASSETS.md`](./ASSETS.md) — asset inventory + licensing.
- [`shared/types.ts`](./shared/types.ts) — protocol structs + tunables + rank thresholds. **Single source of truth.**
- [`.github/workflows/ci-and-deploy.yml`](./.github/workflows/ci-and-deploy.yml) — the pipeline; if this file confuses you, read it before editing anything else.
