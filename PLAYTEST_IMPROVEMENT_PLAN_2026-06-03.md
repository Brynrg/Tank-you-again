# Tank You Again — Playtest-Driven Improvement Plan (2026-06-03)

Author: hands-on playtest of the **single-player web build** (the experience served at
`speedrungames.net/games/tank-you-again/`), cross-referenced against the source.
This is a fresh, prioritized plan grounded in what actually happens when you play —
it complements, not replaces, the historical build docs (`TODO.md`,
`IMPROVEMENT_PLAN.md`, `TANK-YOU-AGAIN_UPGRADE_PLAN.md`).

---

## How I played it

Ran the client (`vite`, single-player mode is on by default — `main.ts` calls
`run({ singlePlayer: true })`), deployed the same bundle the portal ships.
Deployed live URL returns 200. Played ~5 minutes: deployed, moved, fired bullets,
fired a missile, toggled shield, placed mines, fired radar, drove toward fuel,
engaged the named bots (Viper / Rhino / Bishop).

### What works well (keep it)

- **Clean first contact.** Callsign → DEPLOY → in-world in one click. No errors in console.
- **Readable core loop.** Fuel-as-health is legible (fuel 1000 → drained by firing/moving),
  pickups cluster as gold, minimap orients you, rank shown bottom-left.
- **Feel of the systems.** Shield bubble, radar reveal, mine placement, missile vs bullet
  all visibly do something. The 3×-scaled arena (3547²) feels appropriately big.
- **No crashes, stable 20 Hz.** `srv tick` advances smoothly; `rtt=0ms` (local sim).

---

## Findings (what's wrong / weak), in priority order

### P0 — The single-player AI players actually face is a _different, much dumber_ AI

The headline issue. There are **two completely separate AI implementations**:

- **Server-side** (`server/src/sim/ai-*.ts`): a real architecture — perception →
  decision engine → behavior tree, with 4 difficulty tiers (easy/medium/hard/expert).
  This is what the README advertises.
- **Single-player** (`client/src/single-player-net.ts` → `thinkBots()`): a ~40-line
  bot loop. It only **fires bullets**, kites at a fixed range, places a mine at
  `Math.random() < 0.01`, and wanders. No difficulty levels, **no missiles, no shield,
  no radar, no teleport, no salvage-seeking, no team coordination.**

Because the portal ships the _client_ build, virtually every player meets the dumb bots.
The sophisticated AI is dead code for the public.

**Impact:** the game's marquee feature ("intelligent AI opponents that adapt") is not
experienced by web players. Bots feel same-y and passive.

**Fix options (pick one):**

1. **Share one sim.** Extract the simulation + AI into `shared/` so server and
   single-player run the _same_ code. Highest payoff, removes a whole class of
   "works in MP, not SP" divergence bugs. (Larger refactor.)
2. **Port the behavior tiers into `thinkBots()`.** Give SP bots missiles, shield use,
   pickup-seeking, and easy/medium/hard mixing. Cheaper; leaves duplication in place.

Recommend (1) long-term, (2) as a fast win this week.

### P0 — Target affordance is unclear: you can't tell what's clickable

During play I repeatedly issued _move_ commands when I meant to _fire_, because the
green foliage blobs look like targets but clicking them just moves you there
(`targetAt()` only matches enemy tanks within `TANK_RADIUS*1.8` and visible mines).
Twice I drifted across half the map into a corner chasing "enemies" that were bushes.

**Fix:**

- Hover cursor changes (crosshair over a valid target, move-reticle over ground).
- Subtle outline/highlight on the enemy under the cursor.
- Visually separate **foliage/cover** from **enemy tanks** more strongly (enemies
  already have HP rings + names; lean into that — desaturate/blur foliage).

### P1 — Combat readability & feedback

- **Hit feedback is thin.** Bullets land but there's little impact juice — no clear
  hitflash on the victim, no damage number, no screen shake on taking damage.
- **No personal damage indicator.** I couldn't tell when/if I was being hit except by
  watching the fuel bar. Add a directional damage vignette + hull armor flash
  (the armor matrix exists in `types.ts` — surface it on the player's own tank).
- **Projectiles are hard to read** against the busy green terrain. Add brighter
  tracers / muzzle flash / contrails (missile already slower; give it a smoke trail).

### P1 — Onboarding / "what do I do"

There's a one-line hint ("Fuel is health. Scan supplies, mine routes...") and a dense
control strip across the top, but no in-game teaching. New players won't discover
double-click, mines, radar, or salvage.

**Fix:** a 15-second first-run coachmark sequence (move here → fire that → grab fuel),
or a collapsible controls panel. Reuse `speedrungames-sdk` HUD if it offers one.

### P1 — Single-player has no goal / win-state

It's an endless skirmish; bots respawn to keep ~10 alive. There's a rank ladder but no
session arc. For a speedrun-portal game especially, there should be a **scoreable run**.

**Fix:** add a mode with a clear objective + timer (e.g. "destroy N tanks fastest",
"survive X minutes", "reach Sergeant"), wire it to the SDK leaderboard/PB. This is also
what makes it fit `speedrungames.net` thematically.

### P2 — Economy / pacing tuning (validate with numbers)

Observed constants worth balancing once the above ships:

- `FUEL_FIRE_BULLET=5`, `BULLET_DAMAGE=60`, `BULLET_COOLDOWN=5 ticks` → bullets are cheap
  and spammy; `MISSILE_DAMAGE=240` for `FUEL_FIRE_MISSILE=25` is very efficient burst.
- `MINE_DAMAGE=250` + I had 20 mines on the field after a few presses — mines may be
  oppressive / clutter the map. Consider a per-player active-mine cap or TTL
  (P3-5 in `IMPROVEMENT_PLAN.md` already flags TTL — promote it).
- Fuel barely moved while idle; movement drain (`FUEL_MOVE_PER_SEC=8`) is gentle.
  Decide whether fuel should create real pressure (it's the core "health" tension).

### P2 — Mobile story is contradictory

`game.manifest.json` says `supportsMobile: true`; `client/public/speedrungames.json`
says `supportsMobile: false`. Touch controls exist in `input.ts`/`render.ts`. Pick one,
test it on a phone, and make the manifests agree.

### P3 — Repo hygiene (not gameplay, but slows future work)

- **8 overlapping plan/marketing docs** at the root (this is now the 9th — consolidate
  into `docs/` and keep one living roadmap).
- README screenshot is a `via.placeholder.com` link, and credits "Battlefield 2006" /
  placeholder marketing copy. Replace with a real screenshot/GIF from an actual run.
- `npm install` reports 5 vulnerabilities (1 critical) — run `npm audit` and triage.

---

## Suggested sequencing

| Order | Item                                                         | Why first                                 | Rough size |
| ----- | ------------------------------------------------------------ | ----------------------------------------- | ---------- |
| 1     | Target affordance (hover/highlight, foliage vs enemy)        | Cheapest fix to the most-felt frustration | S          |
| 2     | SP bots get missiles/shield/pickup-seeking + difficulty mix  | Makes the _actual_ opponent fun           | M          |
| 3     | Combat feedback (hitflash, damage vignette, tracers)         | Multiplies the value of every fight       | M          |
| 4     | A scoreable single-player mode + SDK leaderboard             | Gives the game a point; fits the portal   | M          |
| 5     | First-run coachmarks                                         | Retention for new players                 | S          |
| 6     | Unify server/SP sim into `shared/`                           | Kills divergence permanently              | L          |
| 7     | Economy/mine balance pass                                    | Tune once systems above are in            | S–M        |
| 8     | Fix mobile manifest contradiction + audit deps + doc cleanup | Hygiene                                   | S          |

---

## One-line summary

The bones are good and it runs clean, but the AI players meet is a stripped-down clone
of the real AI, you can't tell what's clickable, fights lack feedback, and single-player
has no goal. Fix targeting + bot quality + combat juice first; give it a scoreable mode;
then unify the two simulations so this never diverges again.
