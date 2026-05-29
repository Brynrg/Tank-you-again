# Tank You Again — Deployment Runbook

> One-time setup + every-push pipeline for shipping this game to
> `speedrungames.net/games/tank-you-again/`. Follows the canonical contract in
> `Brynrg/speedrungames/AGENTS.md`.

> **⚠️ Current workflows (this doc is partly historical).** There is **one**
> CI/backend workflow, [`.github/workflows/ci-and-deploy.yml`](./.github/workflows/ci-and-deploy.yml)
> (CI + Fly backend deploy), and a separate frontend deploy
> [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml). The frontend
> deploy calls the **portal's reusable workflow** (`deploy-game.yml`), which runs
> `ingest-game-build.mjs` and opens an **auto-merging** portal PR — it does **not**
> `cp` files into the portal. References below to `deploy-frontend.yml` /
> `deploy-backend.yml` are stale (those files never existed as separate workflows).
> **Never hand-copy `client/dist` into the portal.**

## Architecture summary

```
┌─────────────────────────────┐    wss://…/ws    ┌──────────────────────────────┐
│  Vite + Canvas client       │ ───────────────▶ │  Fastify + @fastify/websocket │
│  Built to dist/ → ingested  │                  │  20 Hz authoritative room     │
│  into Brynrg/speedrungames  │                  │  Tank/Projectile/Mine state   │
│  /games/tank-you-again/     │                  │  Prisma → Neon Postgres       │
└─────────────────────────────┘                  └──────────────────────────────┘
        ▲                                                       ▲
        │ deploy-frontend.yml syncs client/dist                 │ deploy-backend.yml
        │                                                       │ flyctl deploy
        │                                                       ▼
   speedrungames.net (Netlify)                          tank-you-again.fly.dev
```

## One-time setup (do these once, in order)

### 1. Create the GitHub repo

```bash
gh repo create Brynrg/Tank-you-again --public \
  --source=. --remote=origin --push \
  --description "Server-authoritative 2D top-down multiplayer tank arena. Deployed to speedrungames.net."
```

If the repo already exists, just fix the remote:

```bash
git remote set-url origin https://github.com/Brynrg/Tank-you-again.git
git push -u origin main
```

### 2. Provision Neon Postgres (free tier — autoscales to zero)

1. Sign in at https://console.neon.tech.
2. Create a project named `tank-you-again`.
3. Copy the **pooled connection string** (the one that ends in `?sslmode=require`).
4. Save it locally for now — `export DATABASE_URL='postgresql://…'`.

Apply the schema:

```bash
cd Tank-you-again
DATABASE_URL='postgresql://…' npx prisma db push --schema=server/prisma/schema.prisma
```

Verify the round-trip:

```bash
DATABASE_URL='postgresql://…' npm run db:test
```

### 3. Provision Fly.io (free tier — shared-cpu-1x, 256 MB, auto-stop)

```bash
# install: brew install flyctl
fly auth login
fly launch --no-deploy --copy-config        # accepts existing fly.toml
fly secrets set DATABASE_URL='postgresql://…@neon.tech/tankpit?sslmode=require'
fly deploy --remote-only                    # first deploy
fly status                                  # verify the machine is running
curl https://tank-you-again.fly.dev/health
# {"status":"ok","tickRate":20,…}
```

### 4. Wire up the GitHub deploy workflows

The repo ships with two existing workflows:

- `.github/workflows/deploy-backend.yml` — runs `flyctl deploy` on every push that touches `server/`, `shared/`, `Dockerfile`, or `fly.toml`.
- `.github/workflows/deploy-frontend.yml` — runs `vite build --base=/games/tank-you-again/` and syncs `client/dist/` into `Brynrg/speedrungames` at `apps/web/public/games/tank-you-again/`, then opens (or fast-forwards) the portal PR.

You need **two repo secrets** on `Brynrg/Tank-you-again`:

| Secret                | Value                                                                      | How to get it                                                   |
| --------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `FLY_API_TOKEN`       | A Fly.io API token                                                         | `fly auth token`                                                |
| `SPEEDRUNGAMES_TOKEN` | A GitHub Personal Access Token with `repo` scope on `Brynrg/speedrungames` | GitHub → Settings → Developer settings → Personal access tokens |

Set them:

```bash
gh secret set FLY_API_TOKEN -b "$(fly auth token)"
gh secret set SPEEDRUNGAMES_TOKEN -b "<pat-with-repo-scope>"
```

### 5. (Optional) Local dev quickstart

```bash
npm install
cp server/.env.example server/.env   # then edit DATABASE_URL
npm run db:test                       # confirm Neon reachable
npm run dev                           # client :5173, server :3001
# Open two browser tabs at http://localhost:5173 and watch the tanks see each other.
```

To skip the database locally:

```bash
DISABLE_DB=1 npm run dev
```

The server falls back to in-memory identities when `DISABLE_DB=1` or
`DATABASE_URL` is unset (see `server/src/index.ts#handleAuthMessage`).

## Every-push pipeline

After the one-time setup, every `git push origin main` does:

1. **CI** (`.github/workflows/ci.yml`)
   - `npm ci`
   - `npx prisma generate`
   - `npm run typecheck` — TypeScript across `shared/`, `server/`, `client/`, `scripts/`.
   - `npm test` — Vitest room-loop suite (6 tests).
   - `npm run build` — server esbuild bundle + Vite client build with portal base path + stages `dist/` at repo root.
   - Smoke-checks that `client/dist/index.html` and `client/dist/game.manifest.json` exist.
   - `npm run format:check` — Prettier gate.

2. **Backend deploy** (`.github/workflows/deploy-backend.yml`)
   - Filtered to changes under `server/`, `shared/`, `Dockerfile`, `fly.toml`.
   - `flyctl deploy --remote-only` → builds in Fly's remote builder, swaps the running machine.

3. **Frontend deploy + portal ingest** (`.github/workflows/deploy-frontend.yml`)
   - Filtered to changes under `client/`, `shared/`.
   - Builds the client, clones `Brynrg/speedrungames`, drops `client/dist/` into `apps/web/public/games/tank-you-again/`, opens or updates a PR.
   - When that PR merges, Netlify auto-deploys the portal and the game goes live.

## Manual ingest (if you want to deploy without waiting for CI)

From this repo (`Tank-you-again/`) after a successful `npm run build`:

```bash
# Dry-run first — shows the manifest that would land in the portal.
node /path/to/speedrungames/scripts/ingest-game-build.mjs \
  --game-dir "$(pwd)" --status preview --dry-run

# Real run (writes to /path/to/speedrungames/apps/web/public/games/tank-you-again/).
node /path/to/speedrungames/scripts/ingest-game-build.mjs \
  --game-dir "$(pwd)" --status preview

# In the portal repo:
cd /path/to/speedrungames
pnpm install --frozen-lockfile
pnpm run build:registry
pnpm run validate:games
pnpm -C apps/web build
# Then commit + open PR per AGENTS.md.
```

Promote `status` from `preview` → `live` only when you've verified the deploy
preview is playable.

## Operational notes

- Fly's free tier **auto-stops on idle**. Cold starts take ~5–10 s — the first
  websocket connect after a quiet period will reconnect a few times before
  the machine wakes. The client's exponential backoff (500 ms → 8 s) handles
  this; no action required.
- Neon's free tier also auto-suspends. First Prisma query after idle takes
  ~2–3 s. `db:test` is the canary if you suspect the branch is suspended.
- All in-game state is **in-memory on the Fly machine**. A machine restart
  wipes every active match. Persistent state (rank, XP, kills, deaths) lives
  in Postgres and survives restarts.
- The umbrella portal currently reads `games.data.json` (legacy registry) for
  the home grid — so even after this game's portal manifest exists at
  `apps/web/public/games/tank-you-again/manifest.json`, you may need to add
  a matching row to `apps/web/src/lib/games.data.json` until the umbrella
  flips to the canonical `games.registry.json` (see the umbrella's
  `IMPROVEMENT_PLAN.md` Task 2).

## Troubleshooting

| Symptom                                                                                          | Likely cause                                             | Fix                                                                                        |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Game loads but `ws=closed` in HUD                                                                | Fly machine off / cold-starting                          | Wait 5–10 s, the client auto-reconnects                                                    |
| `srv tick=0` forever                                                                             | WebSocket connecting to wrong host                       | Check `VITE_WS_URL` in the build environment; default is `wss://tank-you-again.fly.dev/ws` |
| `ERROR: auth/persist failed` in console                                                          | Neon connection blocked or `DATABASE_URL` missing on Fly | `fly secrets list`, re-set DATABASE_URL                                                    |
| Portal ingest fails with "Build output contains references that will break under /games/<slug>/" | Bundle contains `localhost` / `/assets/...`              | Check `client/src/main.ts#resolveWsUrl` — DEV-only branches must be tree-shaken            |
| Vitest fails locally with module-resolution errors                                               | `@prisma/client` not generated                           | `npx prisma generate --schema=server/prisma/schema.prisma`                                 |
| TypeScript error on `@prisma/client` types                                                       | Same                                                     | Same                                                                                       |

## Roll-back

Frontend: in the portal repo, `git revert` the merge commit that landed the
game and Netlify re-deploys the previous build.

Backend: `fly releases` lists every deploy. `fly releases revert <n>` rolls
the running machine back to that release.

## Cost ceiling

- Fly.io free tier: 3 shared-cpu-1x VMs, 3 GB persistent volume, 160 GB/mo
  outbound bandwidth. This game uses 1 VM (auto-stop), 0 volumes.
- Neon free tier: 0.5 GB storage, 191.9 compute hours/mo. The Tank/User
  schema is ~5 KB per active player; 0.5 GB holds ~100 k tanks.
- No usage-billed APIs.
- Net: $0/mo unless usage exceeds the listed ceilings.
