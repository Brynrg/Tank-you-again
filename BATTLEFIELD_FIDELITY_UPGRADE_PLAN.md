# Tank You Again Battlefield Fidelity Upgrade Plan

Target reference: the classic Bonus.com / playbattlefield.com 2D tank game
Battlefield, as represented by TankPit. This is not the EA/DICE FPS series.

## Research Anchor

- TankPit is a remake of the defunct browser game Battlefield. It uses four tank
  colors, optional guest play, persistent tank profiles, and separate scores/ranks
  per tank. Source: [MobyGames](https://www.mobygames.com/game/71759/tankpit/).
- The original loop is point-and-select and partially turn-based: players give
  commands in real time, but tanks execute moves in turns. Source:
  [MobyGames](https://www.mobygames.com/game/71759/tankpit/).
- Fuel is the health and action economy. Moving, teleporting, laying mines,
  radar use, shooting, and incoming fire all spend fuel; zero fuel deactivates
  the tank. Fuel canisters replenish it, and players can deposit fuel on the map.
  Source: [MobyGames](https://www.mobygames.com/game/71759/tankpit/).
- Core equipment includes stronger weapons, protective shields, and long-range
  radar; radar reveals hidden fuel/equipment pickups and enemy mines. Source:
  [MobyGames](https://www.mobygames.com/game/71759/tankpit/).
- Classic map features include draggable obstacles and ferries for water travel.
  Source: [MobyGames](https://www.mobygames.com/game/71759/tankpit/).
- TankPit still enforces anti-quit and reconnect behavior: players cannot leave
  immediately during combat, disconnected tanks remain in-game briefly, and
  reconnect can resume the same battle. Source:
  [TankPit Help](https://tankpit.com/help).
- Promotion requires points plus deactivating qualifying opponents; deactivation
  can demote a tank. Sources:
  [TankPit Help](https://tankpit.com/help),
  [MobyGames](https://www.mobygames.com/game/71759/tankpit/).

## Current Repo Read

The current `main` branch is a good networked arena foundation, but not yet close
to original Battlefield feel.

Already present:

- Server-authoritative 20 Hz room loop in `server/src/loop.ts`.
- Shared protocol/tunables in `shared/types.ts`.
- Fuel-as-health and action fuel costs for movement, bullets, missiles, mines,
  shield, teleport, and damage.
- Basic mine masking, radar-sweep simplification, pickups, respawn protection,
  rank XP hooks, guest auth, leaderboard endpoint, and Canvas rendering.
- Local validation passed on 2026-05-21: `npm test`, `npm run typecheck`, and
  `npm run build`.

Main fidelity gaps:

- Input is WASD plus mouse aim; the reference is point-and-click command play.
- Movement is smooth at 20 Hz; the reference is real-time commands resolved in
  discrete turns.
- Fuel economy lacks radar cost, fuel deposit, equipment inventory/capacity,
  hidden fuel/equipment discovery loop, and deactivation demotion rules.
- Combat uses generic bullets/missiles. It does not model classic equipment
  toggles such as dual shots, shields as consumable defensive equipment, or
  long-range radar.
- Maps are just a flat bounded rectangle with grid. There are no classic
  obstacles, bases, water/ferries, map variants, or team home areas.
- Progression is XP-threshold based, but classic promotion depends on promotion
  points and specific opponent-rank deactivations.
- Disconnect handling removes the tank immediately instead of preserving a
  reconnectable, temporarily protected/uncontrollable tank.
- Existing `COMPLETION_STATUS.md` and parts of `IMPROVEMENT_PLAN.md` are stale
  relative to the current code.

## Fidelity Pillars

1. Command rhythm over twitch movement

   Replace direct WASD driving with command intents: click destination, click
   enemy/fire, click pickup, hotkey equipment. The server should process command
   batches on a slower fixed command cadence while still broadcasting snapshots
   at 20 Hz for smooth interpolation. This preserves the original "commands in
   real time, moves in turns" feel without making the browser UI look choppy.

2. Fuel as the entire economy

   Keep fuel as health, but complete the loop: radar consumes fuel, firing modes
   consume fuel, teleport consumes fuel, mines consume fuel, players can deposit
   fuel, fuel canisters become strategically hidden/visible pickups, and all
   deactivation/death paths reconcile fuel, stats, rank, and respawn delay.

3. Equipment-first combat

   Convert the current ammo fields into a classic equipment inventory with
   capacity by rank. Add toggled equipment slots:
   - Dual shot / upgraded shot: stronger outgoing fire while enabled.
   - Armor shield: blocks or reduces incoming shots while consuming equipment or
     fuel, best used as a clutch survival tool.
   - Radar / extra radar: active scan that reveals fuel, equipment, and enemy
     mines in a radius or full screen depending on equipment tier.
   - Mines: placed traps that remain hidden unless owned, allied, or scanned.
   - Teleport: map-targeted relocation with strict fuel/equipment cost.

4. Map interaction

   Build maps from deterministic data: terrain, water, bases, obstacles, ferries,
   spawn regions, and pickup tables. Obstacles need server-owned drag/drop state
   and collision. Ferries should be explicit moving platforms or interactive
   transport lanes, not just decorative water crossings.

5. Classic ranks and awards

   Replace pure XP gates with promotion points plus required deactivations of
   specific rank bands. Add demotion on deactivation, highest-rank history,
   medals/awards, and tournament-specific anti-feed checks.

6. Modern skin without modernizing away the game

   Keep the classic information density: map, rank, fuel, equipment toggles,
   radar feedback, team colors, and battlefield messages should be immediate.
   Improve sprites, effects, sound, and responsiveness, but do not turn it into a
   WASD twin-stick arena shooter.

## Implementation Plan

### Phase 0 - Spec Cleanup and Test Harness

Files:

- `BATTLEFIELD_FIDELITY_UPGRADE_PLAN.md`
- `COMPLETION_STATUS.md`
- `IMPROVEMENT_PLAN.md`
- `server/src/__tests__/loop.test.ts`

Tasks:

- Mark stale docs as historical or update them to current code reality.
- Add a `docs/reference/battlefield-fidelity.md` with target mechanics and
  explicit "clone feel, not copyrighted assets" boundaries.
- Add deterministic simulation fixtures for fuel costs, deactivation, radar
  reveal, equipment toggles, mine masking, and command turns.

Acceptance:

- A future agent can start implementation without re-discovering target rules.
- `npm test`, `npm run typecheck`, and `npm run build` remain green.

### Phase 1 - Command-Based Movement and Input

Files:

- `shared/types.ts`
- `server/src/loop-types.ts`
- `server/src/loop.ts`
- `server/src/sim/movement.ts`
- `client/src/input.ts`
- `client/src/loop.ts`
- `client/src/render.ts`

Tasks:

- Add `MOVE_TO`, `FIRE_AT`, `COLLECT`, and `STOP` command messages.
- Keep keyboard movement only as an optional modern accessibility mode, disabled
  by default for fidelity.
- Add server command cadence, path-to-target stepping, command cancellation, and
  arrival thresholds.
- Render destination markers, command path hints, and click affordances.

Acceptance:

- Holding a key is no longer the primary movement model.
- A tank moves because the server owns a current command, not because the client
  streams directional state forever.

### Phase 2 - Equipment Inventory and Radar

Files:

- `shared/types.ts`
- `server/src/sim/equipment.ts`
- `server/src/sim/vision.ts`
- `server/src/sim/economy.ts`
- `server/src/loop.ts`
- `client/src/input.ts`
- `client/src/render.ts`

Tasks:

- Replace raw `ammo` with equipment counts and enabled flags.
- Implement radar as an active command with fuel/equipment cost and reveal
  timestamps scoped per viewer, not global per mine.
- Add hidden pickups that are only visible after radar, proximity, or ownership
  rules allow them.
- Add fuel deposit and pickup collection behavior.

Acceptance:

- Players can run low on fuel, scan, discover fuel/equipment, and choose whether
  to fight, retreat, deposit, or teleport.
- Hidden mines and hidden pickups cannot be inferred from snapshot payload size.

### Phase 3 - Classic Combat and Deactivation

Files:

- `server/src/sim/combat.ts`
- `server/src/sim/damage.ts`
- `server/src/sim/mines.ts`
- `server/src/loop.ts`
- `shared/types.ts`
- `client/src/render.ts`

Tasks:

- Add shot cadence and damage tables for standard shots, upgraded/dual shots,
  shields, mines, and teleport escape timing.
- Add kill credit, assist attribution, self-deactivation, and disconnect/quit
  deactivation rules.
- Add "combat lock" so a player cannot safely quit immediately after taking or
  dealing damage.

Acceptance:

- A duel feels like original Battlefield/TankPit: fuel management matters as
  much as aim, shields are a timed survival decision, and mines are strategic
  traps rather than visible explosives.

### Phase 4 - Maps, Obstacles, Ferries, Bases

Files:

- `shared/types.ts`
- `server/src/sim/map.ts`
- `server/src/sim/world.ts`
- `server/src/sim/movement.ts`
- `client/src/render.ts`
- `client/public/maps/*.json`

Tasks:

- Define map manifest format: terrain, water, ferry routes, bases, obstacles,
  spawn zones, pickup zones, and tournament metadata.
- Implement obstacle collision and drag/drop commands.
- Implement ferries or ferry lanes over water.
- Add team home bases and anti-base-breaking mine logic if obstacles expose base
  gaps.

Acceptance:

- At least one map supports classic tactics: hiding fuel, scanning, obstacle
  movement, ferry route control, base pressure, and mine traps.

### Phase 5 - Progression, Persistence, and Anti-Abuse

Files:

- `server/prisma/schema.prisma`
- `server/src/auth.ts`
- `server/src/sim/rank.ts`
- `server/src/index.ts`
- `shared/types.ts`

Tasks:

- Add promotion points, required deactivation rules, demotion on deactivation,
  medals/awards, tank color state, and season/tournament records.
- Add registered-user auth so permanent tank profiles matter.
- Add related-account/IP anti-feed hooks for tournament kills.
- Add reconnectable active tank sessions with temporary uncontrollable state.

Acceptance:

- Rank progression cannot be reproduced by XP farming alone.
- Disconnect/reconnect behavior matches the classic "tank remains in battle"
  expectation.

### Phase 6 - Bots, Tournaments, and Live Operations

Files:

- `server/src/sim/bots.ts`
- `server/src/sim/tournament.ts`
- `server/src/index.ts`
- `client/src/render.ts`
- `server/prisma/schema.prisma`

Tasks:

- Add color-team bot tanks, with bot rank caps and smarter behavior by rank.
- Add tournament rooms, second-deactivation elimination, recordings/event logs,
  and leaderboard views.
- Add admin-safe observability: active rooms, tick health, snapshot size, combat
  events, suspicious promotion events.

Acceptance:

- The game can sustain casual world play and scheduled tournaments.

### Phase 7 - Modern Visual Skin and Feel Pass

Files:

- `client/src/render.ts`
- `client/src/audio.ts`
- `client/src/ui/*`
- `client/public/assets/*`

Tasks:

- Replace primitive rectangles with modern but readable sprites.
- Add classic-density HUD: fuel, rank, equipment toggles, radar state, messages,
  minimap/map view, and team color clarity.
- Add sound effects for scan, hit, shield, mine, fuel pickup, promotion, and
  deactivation.
- Add settings for hotkeys, game size, sounds, graphics/sprites, and map colors.

Acceptance:

- The game looks modern, but every visual decision still supports original
  Battlefield decisions: find fuel, scan, chase, mine, shield, teleport, rank.

## Recommended Execution Order

1. Update stale docs and add simulation tests for the target mechanics.
2. Refactor input/movement to command-based play before tuning combat.
3. Implement equipment/radar/fuel discovery before adding map complexity.
4. Add obstacles/ferries/bases once commands and radar are stable.
5. Only then tune progression, bots, tournaments, and visual polish.

The biggest technical risk is changing movement feel after combat and maps are
already tuned. Do command cadence first.
