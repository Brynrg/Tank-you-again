# Completion Status

> Status doc for AI agents working on this repo. Updated 2026-05-19.

**Score:** 25 / 100 — Solid scaffolding, infra/deploy/CI in place, but game itself is ~0% built
**State:** Phase-1 bootstrap. Targets speedrungames.net.
**Stack:** TypeScript monorepo — Vite + Canvas client, Fastify + `@fastify/websocket` + Prisma server, shared `@shared/types` package. Fly.io WebSocket backend, Neon Postgres, GitHub Actions sync into `Brynrg/speedrungames` under `/games/tank-you-again/`.

## What works
- Client `main.ts` (~65 lines: placeholder canvas + WS open)
- Server `index.ts` (~50 lines: `/health` + `/ws` route)
- Prisma schema (User, Tank w/ XP), bcrypt password lib, validation lib, discriminated `Validation<T>`
- CI: `deploy-backend.yml` → flyctl, `deploy-frontend.yml` → speedrungames sync with `--base=/games/tank-you-again/`
- Dockerfile + `fly.toml` (shared-cpu-1x, 256MB, auto-stop, native WS)
- Prettier baseline, path aliases, `db:test` script
- TODO.md is a thorough spec (8-way movement, fuel-as-health, landmines, masked radar, military rank ladder)

## Known gaps
- **No game logic** — almost none of TODO.md is implemented
- No tests
- No `speedrungames.json` manifest yet — umbrella catalog can't auto-discover this
- Does NOT consume `speedrungames-sdk` — should adopt the SDK for timer/HUD/leaderboard
- No `pnpm typecheck && pnpm build` CI step — only the two deploy workflows gate code

## Priority improvements
1. **Add `speedrungames.json` manifest** at `client/public/` so umbrella auto-discovery works
2. **Stand up the 20 Hz authoritative room loop** — single `RoomLoop` class with deterministic tick + snapshot emit. Until this lands, everything else in TODO.md is blocked.
3. **Adopt `speedrungames-sdk`** for timer/HUD — replace placeholder canvas wrapper
4. **Add Vitest config** + one protocol/snapshot test per phase as it lands
5. **Add `ci.yml`** with `pnpm typecheck && pnpm build`

## Notes for AI agents
- Auto-deploys to `Brynrg/speedrungames` at `/games/tank-you-again/` once a build is built (see `deploy-frontend.yml`)
- **Related repos**: `speedrungames` (umbrella), `speedrungames-sdk` (consume this for timer/leaderboard), `speedrungames-game-template` (reference for manifest format)
- Authoritative server pattern — never trust client positions. All movement/damage on server tick.
