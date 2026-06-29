# Tank You Again — Game Improvement Plan (2026-06-12)

**The living roadmap.** Supersedes `PLAYTEST_IMPROVEMENT_PLAN_2026-06-03.md` (its
P0/P1 items are largely shipped — see "Already fixed" below) and consolidates the
still-relevant remains of the 8 older planning docs. New evidence source: a
100-turn **AI playtest** — four LLMs piloted tanks through the real `shared/sim`
Arena (`scripts/llm-arena.ts`), producing the game's first quantitative combat
dataset: ~760 shots, 38 deaths, 36 kill credits, full positional replay
(`scripts/llm-arena-logs/2026-06-12T05-09-55/`, open `replay.html` to watch).

## Already fixed since the 2026-06-03 playtest (verified in code)

- ✅ Single source of truth sim: client SP and server both run `shared/sim/Arena`
  — the "dumb SP bots" problem is gone (`single-player-net.ts` instantiates Arena).
- ✅ Cursor reticle showing fire/loot/move affordance (`loop.ts` → `drawCursorReticle`).
- ✅ Hit effects / screen shake / kill feed in client render.
- ✅ Power tiers + passive fuel regen ("Strategic depth" commit) — and the AI
  playtest **validates the anti-death-spiral design: 0 of 38 deaths were fuel
  starvation.**

---

## A. Balance — evidence from the AI playtest

### A1. Missiles are strictly dominated by bullets (P1)
Usage: 703 bullet shots vs 57 missiles. Both 14-kill players were ~98 % bullet
users; the missile-heavy pilot went 7/12. The math agrees:

| | Sustained DPS | Damage per fuel | Projectile speed | Ammo |
|---|---|---|---|---|
| Bullet | 240 | 12.0 | 600 u/s | infinite |
| Missile | 267 | 9.6 | 380 u/s (easier to dodge) | 5, pickup-gated |

Burst alpha is the missile's only edge, and the slower projectile cancels it at
range. **Options (pick one):** raise `MISSILE_SPEED` 380→480 so it lands at
mid-range; or nerf bullet sustain (`BULLET_COOLDOWN_TICKS` 5→7 and/or
`FUEL_FIRE_BULLET` 5→8) so missiles are the burst weapon they're priced as.
Re-run the AI match after tuning and watch the weapon mix shift (see D3).

### A2. Mines kill their owners (P1)
~10 mines placed, 3 detonations — **2 of the 3 lethal detonations killed the
mine's own placer.** Root cause in `shared/sim/mines.ts`: the mine drops only
`MINE_RADIUS*0.6` ≈ 14 u behind the tank — inside its own 24 u trigger/blast
radius — so anyone who lays a mine while being chased stands in their own blast.
Ally/owner blast damage is documented TankPit-faithful behavior, but the current
geometry makes mine use net-negative. **Fix without losing fidelity:** 1–2 s
arming delay + drop offset > blast radius; optionally halve self-damage. Keep
ally fratricide. Also promote the old P3-5 mine TTL / per-player active cap
(map clutter guard).

### A3. Shield economics punish exactly the players who need it (P2)
The winner toggled shield once; the last-place pilot toggled it 29 times and
bled out (30 fuel/s drain vs halved damage only pays off under sustained fire).
A shield left on while not being shot is a death sentence the HUD never explains.
**Options:** auto-lower after ~3 s without taking damage; or convert to a timed
bubble (fixed 4 s per charge, no drain). Either keeps the item, removes the trap.

### A4. The strong farm the weak — no comeback pressure (P2)
The winning pilot took 8 of its 14 kills from the weakest player; power tiers
(damage/speed multipliers) widen the gap each kill. Human lobbies will feel this
as "new player gets hunted, quits." **Add:** kill bounty scaled by victim's power
tier (hunting the leader pays more than farming the rookie), and respawn
placement biased away from the killer's position. Both are sim-side, few lines.

### A5. Kill credit leaks on fuel-drain deaths (P3)
`killTank(tank, null)` when fuel hits 0 from movement/costs: if you shot someone
to 20 fuel and they die driving away, nobody gets credit. Add a last-damager tag
(~5 s window) and attribute the kill. Zero cases in the AI match but it's a
human-visible injustice ("I did all the work").

## B. Pacing — the map is empty under fog (P1)

Quantified from the replay: with 4 active tanks on 3547², the nearest enemy was
**beyond the 700 u vision radius 60 % of the time** (median nearest-enemy
distance 863 u). Real players see fog — that's a mostly-empty screen for most of
the match, on top of mean 4.7 projectiles in flight across the whole map.
TankPit's magic was crowded chaos. **Options, cheapest first:**
1. Scale the playable area with population (soft zone walls; 4 players ≈ 1800²,
   open up as the room fills).
2. Spawn pickups in clusters ("supply drops") to create conflict magnets instead
   of uniform scatter.
3. Bias respawn points toward the action centroid (also helps A4's
   away-from-killer rule — same placement function).
The AI harness can A/B these: re-run with a zone and watch time-in-contact.

## C. Modes & retention (carried forward — still the biggest gap)

- **C1. Scoreable single-player mode (P1).** Still no goal/win-state; it's an
  endless skirmish on a speedrun portal. "Destroy 15 tanks fastest" or "reach
  Sergeant" with a timer, wired to the speedrungames SDK leaderboard/PB. This is
  the single highest-leverage retention item and makes the game fit its host site.
- **C2. Match arc for multiplayer (P2).** Rooms run forever; add a 10-minute
  match timer + final scoreboard + reset. Gives sessions a story and a reason to
  rematch.
- **C3. Mobile manifest contradiction (P3).** `game.manifest.json` says
  `supportsMobile: true`, `client/public/speedrungames.json` says `false`. Touch
  code exists — test on a phone, then make them agree.

## D. Tech foundation

- **D1. Seeded RNG in the sim (P1, enables everything below).** 22 `Math.random`
  call sites in `shared/sim/` make matches unreproducible. Inject a seeded PRNG
  through `ArenaOptions`. Payoff: deterministic tests, true replays (record
  inputs, re-simulate — today's replay logs positions because it can't), server
  replay validation, and apples-to-apples balance A/Bs.
- **D2. `snapshotFor` fails open (P2, security).** An unknown/stale viewer id
  returns the **entire unmasked world** (my spectator view exploited exactly
  this). If any server path ever requests a snapshot for a despawned tank and
  ships it, that's a maphack. Make unknown viewers return an empty snapshot;
  add an explicit `snapshotSpectator()` for legitimate full views.
- **D3. AI playtest as balance CI (P2).** The LLM arena (`scripts/llm-arena.ts`)
  is now a repeatable playtest rig: every tunables change can be validated by a
  scripted match + metrics (weapon mix, time-in-contact, TTK, kill spread, fuel
  pressure). Wire a `npm run playtest:ai` that runs N rounds and prints the
  metric table; eyeball drift before shipping balance changes. (Scripted
  behavior-tree bots can stand in for LLMs in CI for zero-cost runs; LLM pilots
  for richer judgment locally.)
- **D4. Replay/spectator for the real game (P3).** The match replay viewer
  (`scripts/llm-arena-replay.ts` → self-contained `replay.html`) already renders
  snapshots+feed. Recording server snapshots per room would give shareable
  replays — strong portal content. Cheap once D1 lands.
- **D5. Doc consolidation (P3).** This file plus `TODO.md` are the living docs;
  move the other ~8 root plan/marketing docs into `docs/archive/`. (Old
  playtest plan itself recommended this.)

## Suggested sequence

| # | Item | Size | Why now |
|---|---|---|---|
| 1 | A2 mine arming delay + offset | S | 2 of 3 mine kills are suicides; tiny fix |
| 2 | A1 missile/bullet rebalance | S | One-constant changes; biggest combat-feel win |
| 3 | B map density (zone or pickup clusters) | M | 60 %-empty-screen is the worst human experience risk |
| 4 | C1 scoreable SP mode + leaderboard | M | Retention + portal fit; long overdue |
| 5 | D1 seeded RNG | M | Unlocks replays, tests, honest A/Bs |
| 6 | A3 shield rework + A4 bounty/respawn | S–M | Anti-frustration pass |
| 7 | D3 playtest harness in CI | S | Locks in the balance loop for every future change |
| 8 | D2 snapshot fail-closed, A5 kill credit, C2 match arc, C3 manifest, D5 docs | S each | Hygiene + polish batch |

## One-line summary

The sim is unified, stable, and feedback-rich now — what the data says is wrong
is the *game design layer*: bullets obsolete missiles, mines suicide their
owners, shields trap weak players, the map is 60 % empty under fog, and there's
still nothing to win. Tune the four constants, densify the field, ship a
scoreable mode — and keep the AI arena running as the regression test for fun.
