# AI Agent Upgrade Playbook

Purpose: upgrade Tank You Again toward the Bonus.com / playbattlefield.com
`Battlefield` tank game feel, with a modern independent skin.

This document is written for future AI agents working in this repository. Follow
it as the execution plan. Do not redo the same research unless a specific source
gap blocks implementation.

## Read First

1. `research/battlefield/INSPECTION.md` is the current source-of-truth research
   artifact.
2. `BATTLEFIELD_FIDELITY_UPGRADE_PLAN.md` is the older broad roadmap. Treat this
   playbook as the more tactical execution order.
3. `progress.md` records recent completed slices.
4. Preserve the legal boundary: reproduce rules, pacing, affordances, and game
   feel. Do not copy original Battlefield applet code, TankPit source, TankPit
   sprites, medals, site art, or other proprietary/community assets.

Reference game: Bonus.com / playbattlefield.com `Battlefield`, not the EA/DICE
FPS series.

## Current Baseline

Already implemented in this repo:

- Server-authoritative room loop and shared protocol.
- Fuel-as-health and fuel costs for core actions.
- Click-to-move command foundation.
- Active radar scan with per-viewer reveal state.
- Hidden pickups and mines.
- Shield and radar equipment counts.
- Mines, teleport, pickups, ranks, leaderboard persistence, guest play.
- HUD and callsign overlay copy that states the objective.
- Fixed cursor aim handling for bullet/missile fire.

Main remaining gaps:

- Original double-click fire and click-and-hold pickup/drop are missing.
- Firing is not yet a server-owned target command.
- Equipment is not yet modeled as classic toggles: shield, dual, missile,
  homing, extra radar.
- There is no pickup/drop, fuel deposit, movable obstacle, ferry, or named-map
  game loop.
- Classic information panels are missing: nearest enemy, active forces, active
  players, statistics, inventory, locator, Top 10, tips/comments, sound,
  auto-scroll.
- Progression is still XP-style, not promotion requirements, demotion, medals,
  tournament records, and multi-tank registered identity.
- Disconnect/combat-lock behavior is not faithful.

## Global Rules For Agents

- Keep changes sliced. Each phase should be a coherent commit.
- Prefer existing repo patterns in `shared/types.ts`, `server/src/loop.ts`,
  `server/src/sim/*`, `client/src/input.ts`, `client/src/render.ts`, and tests.
- Add or update tests for server-owned behavior. Do not rely only on manual
  browser checks.
- For visible gameplay changes, run a browser playtest or Playwright check.
- Keep the first screen as the game, not a marketing page.
- Maintain information density. Battlefield should feel command-and-status
  driven, not like a generic WASD arena shooter.
- After each phase run:
  - `npm test`
  - `npm run typecheck`
  - `npm run format:check`
  - `npm run build`
- Before committing, verify `git status --short` and include only intentional
  files.
- Push `main` only after validation passes and the working tree is clean.

## Phase 1 - Original Input Parity

Goal: match the archived Battlefield shortcut model.

Source anchor:
<https://web.archive.org/web/20040615002343/http://www.playbattlefield.com/game/shortcutkeys.html>

Implement:

- Click: move command.
- Double-click: fire command.
- Space: fire command.
- Click-and-hold: pickup/drop command.
- `1`: shield on/off.
- `2`: dual shot on/off.
- `3`: missile on/off.
- `4`: homing on/off.
- `5`: extra radar on/off.
- Keep `M` for mine only if it does not conflict with the classic tips toggle;
  otherwise move mine to a visible equipment command.
- Add affordance text in HUD that reflects the actual current controls.

Likely files:

- `shared/types.ts`
- `client/src/input.ts`
- `client/src/loop.ts`
- `client/src/render.ts`
- `server/src/loop.ts`
- `server/src/__tests__/loop.test.ts`

Acceptance:

- Double-clicking the playfield fires without issuing a stuck move.
- Space fires toward current cursor or selected target.
- Click-and-hold near an interactable queues pickup/drop.
- Number keys update equipment mode state and HUD.
- Tests cover input messages and server handling for new commands.

## Phase 2 - Server-Owned Target Firing

Goal: make firing command-based instead of client-direction twitch logic.

Implement:

- Add `FIRE_AT` protocol message with target world coordinates and optional
  target tank id.
- Server resolves shot direction from tank position to target at fire time.
- Double-click enemy: fire at that tank.
- Double-click ground: fire at that point.
- Space: fire at cursor world coordinate, or selected target if one exists.
- Preserve current anti-stale cursor aim fix as fallback, but do not let it be
  the primary combat model.
- Add shot cadence/timing so firing feels deliberate.

Likely files:

- `shared/types.ts`
- `server/src/sim/combat.ts`
- `server/src/loop.ts`
- `client/src/input.ts`
- `client/src/loop.ts`
- `client/src/render.ts`
- `server/src/__tests__/loop.test.ts`

Acceptance:

- Tests prove firing right, left, up, and down produces expected projectile
  vectors.
- Targeted fire follows server-side target resolution.
- Client cannot spoof impossible projectile direction independent of its tank
  position.
- Browser playtest confirms shooting follows cursor/target in multiple
  directions.

## Phase 3 - Pickup, Drop, And Fuel Deposit

Goal: implement the original "Click and Hold - Pick Up / Drop" loop.

Implement:

- Client long-press detection for playfield interactions.
- `INTERACT_HOLD` or explicit `PICKUP_DROP` command.
- Server-side proximity check for fuel/equipment pickup.
- Fuel deposit command that drops a fuel canister from the tank's current fuel.
- Equipment drop if inventory supports it.
- HUD feedback when an item is picked up, dropped, or out of range.
- Do not expose hidden pickups to clients that have not discovered them.

Likely files:

- `shared/types.ts`
- `server/src/sim/economy.ts`
- `server/src/sim/world.ts`
- `server/src/sim/vision.ts`
- `server/src/loop.ts`
- `client/src/input.ts`
- `client/src/render.ts`
- tests in `server/src/__tests__/loop.test.ts`

Acceptance:

- Holding click near visible fuel picks it up.
- Holding click when carrying/depositing fuel drops fuel into the world.
- Fuel deposit reduces tank fuel and creates a pickup visible by proximity/radar
  rules.
- Hidden pickup snapshot size does not reveal undiscovered objects.

## Phase 4 - Classic Equipment Modes

Goal: make equipment the core combat layer.

Implement equipment inventory and active modes:

- Shield on/off: reduces or blocks damage while draining fuel and/or equipment.
- Dual shot on/off: fires paired shots or stronger shots at higher cost.
- Missile on/off: changes fire command to missile behavior.
- Homing on/off: missile variant that tracks a selected target with fair limits.
- Extra radar on/off: stronger scan mode, wider range, or longer reveal.
- Mines and teleport should share the same inventory/equipment model.

Design requirements:

- Equipment counts are server-authoritative.
- Modes persist until toggled off, depleted, or deactivated.
- Fuel pressure remains central.
- HUD shows counts and mode state clearly.

Likely files:

- `shared/types.ts`
- new `server/src/sim/equipment.ts`
- `server/src/sim/combat.ts`
- `server/src/sim/damage.ts`
- `server/src/sim/vision.ts`
- `server/src/loop.ts`
- `client/src/input.ts`
- `client/src/render.ts`

Acceptance:

- Tests cover each mode toggle, depletion, and fuel cost.
- Shield cannot be activated without equipment.
- Dual/missile/homing alter server-created projectile behavior.
- Extra radar reveals more than normal radar without leaking hidden data.

## Phase 5 - Classic Information Panels

Goal: add the non-combat controls that make Battlefield readable.

Implement compact overlays for:

- `E` nearest enemy.
- `F` active forces.
- `?` active players.
- `C` statistics.
- `I` inventory.
- `L` locator.
- `T` Top 10 or map standings placeholder.
- Tips/comments toggles if they fit the current UI.
- Sound and auto-scroll toggles if those systems exist.

Likely files:

- `client/src/input.ts`
- `client/src/render.ts`
- `client/src/loop.ts`
- shared snapshot types if server-provided state is needed.

Acceptance:

- Player can understand who is active, where danger is, what inventory they have,
  and what their current objective is without leaving the game.
- Panels do not cover critical playfield information for long.
- Keyboard shortcuts match the archived control vocabulary unless a conflict is
  intentionally documented.

## Phase 6 - Command-Turn Rhythm

Goal: move from smooth action arena to real-time commands resolved in turns.

Implement:

- A command cadence separate from 20 Hz rendering snapshots.
- Movement advances on command ticks while rendering interpolates smoothly.
- Fire/equipment commands resolve on cadence boundaries or deliberate cooldowns.
- Tune movement/fuel costs so clicking a destination feels tactical.
- Add visible command feedback: destination marker, queued command, stop state.

Likely files:

- `server/src/loop.ts`
- `server/src/sim/movement.ts`
- `server/src/sim/combat.ts`
- `shared/types.ts`
- `client/src/render.ts`
- tests in `server/src/__tests__/loop.test.ts`

Acceptance:

- Holding a key is not a primary movement model.
- Repeated command spam does not bypass cadence.
- Movement/firing feels intentional but not visually choppy.

## Phase 7 - First Real Battlefield Map

Goal: replace the flat arena with one named, tactical Battlefield-style map.

Implement first map: `Rocks and Swamp`.

Map manifest should include:

- Name and id.
- Terrain tiles.
- Water zones.
- Spawn regions by troop color.
- Pickup zones.
- Obstacle positions.
- Ferry routes or ferry lanes.
- Optional base/home regions.
- Map-specific standings metadata.

Server behavior:

- Terrain collision.
- Water restrictions.
- Ferry transport over water.
- Movable obstacle pickup/drop or drag behavior.
- Spawn selection from map data.
- Pickups and mines respect terrain rules.

Client behavior:

- Render terrain, water, obstacles, ferry, and spawn/base hints.
- Keep a modern independent skin; do not copy TankPit sprites.

Likely files:

- `shared/types.ts`
- new `client/public/maps/*.json` or equivalent map folder.
- new `server/src/sim/map.ts`
- `server/src/sim/world.ts`
- `server/src/sim/movement.ts`
- `server/src/loop.ts`
- `client/src/render.ts`

Acceptance:

- One map supports obstacle tactics, water/ferry routing, scans, mines, hidden
  supplies, and spawn regions.
- Tests cover collision, ferry movement, and invalid placement.
- Browser playtest confirms the map is readable and interactive.

## Phase 8 - Progression, Awards, And Competitive Shell

Goal: make registered tank identity matter.

Implement:

- Multiple tanks per account, working toward the original "up to 16 tanks"
  concept.
- Guest rank restrictions and unsaved accomplishments.
- Promotion requirements beyond XP.
- Deactivation demotion.
- Medal/award data model.
- Map-specific Top 25.
- Tournament result persistence.
- Team/troop color identity in standings and profiles.

Likely files:

- `server/prisma/schema.prisma`
- `server/src/auth.ts`
- `server/src/index.ts`
- new `server/src/sim/rank.ts` changes.
- `shared/types.ts`
- client leaderboard/profile surfaces.

Acceptance:

- A registered tank can progress, demote, and earn awards.
- Guest play remains frictionless but limited.
- Top lists can be scoped by map and troop color.
- Migration is documented and tests cover rank/demotion rules.

## Phase 9 - Disconnect, Quit, And Combat Lock

Goal: prevent safe combat dodging and support reconnect.

Implement:

- Combat lock after dealing or taking damage.
- Exit command that is delayed or blocked during combat lock.
- Disconnected tanks remain in-game briefly.
- Reconnect can resume the same tank if within timeout.
- Deactivation or penalty if combat-locked disconnect expires.

Likely files:

- `server/src/connection.ts`
- `server/src/loop.ts`
- `server/src/index.ts`
- shared snapshot/session types.
- tests in `server/src/__tests__/loop.test.ts`

Acceptance:

- A player cannot avoid deactivation by closing the tab during a fight.
- Reconnect within timeout resumes battle state.
- Non-combat disconnect remains user-friendly.

## Phase 10 - Modern Skin Pass

Goal: improve visuals while preserving classic game readability.

Implement:

- Independent modern tank sprites or Canvas shapes.
- Modern terrain tiles and effects.
- Clear equipment state icons.
- Radar pulse and reveal feedback.
- Explosion/dust effects inspired by function, not copied assets.
- Dense HUD, not a landing-page or card-heavy interface.

Acceptance:

- The first viewport is the playable game.
- Text and HUD do not overlap on desktop or mobile.
- Assets are original or permissively licensed.
- Browser screenshot checks show nonblank, readable gameplay.

## Completion Definition

The upgrade is complete when:

- Default gameplay uses click/command controls, not WASD-first controls.
- Double-click/Space fire and click-hold pickup/drop work.
- Fuel is the full health/action economy, including deposit and hidden recovery.
- Equipment modes are toggled, count-limited, and server-authoritative.
- At least one named map includes obstacles, water, ferries, spawn regions, and
  hidden supplies.
- Information panels expose inventory, active players/forces, locator, nearest
  enemy, and standings.
- Rank includes promotion requirements, deactivation demotion, and awards.
- Disconnect/combat-lock behavior prevents quit abuse.
- `npm test`, `npm run typecheck`, `npm run format:check`, and `npm run build`
  pass.
- The final agent commits and pushes `main`.

## Suggested Commit Sequence

1. `Add original Battlefield input bindings`
2. `Make firing target-command based`
3. `Add pickup drop and fuel deposit`
4. `Add classic equipment modes`
5. `Add Battlefield information panels`
6. `Add command cadence`
7. `Add Rocks and Swamp map`
8. `Add progression awards and standings`
9. `Add combat lock reconnect behavior`
10. `Modernize Battlefield visual skin`

Each commit should include tests and should leave the app playable.
