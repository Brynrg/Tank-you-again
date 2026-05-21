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

- Local-model rule: execute one ticket at a time. Do not combine tickets unless
  the user explicitly asks for a larger batch.
- Stop after each ticket if tests fail. Fix the current ticket before starting
  the next one.
- Keep changes sliced. Each ticket should be a coherent commit.
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

## Architecture Map

Use this ownership map before editing. Keep changes in the smallest owner that
fits the behavior.

| Area               | Primary Files                            | Ownership                                                                                 |
| ------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Protocol/types     | `shared/types.ts`                        | Client/server message types, snapshot shapes, entity state, shared constants.             |
| Client input       | `client/src/input.ts`                    | Mouse/keyboard events, local command queues, cursor/world coordinate conversion.          |
| Client loop        | `client/src/loop.ts`                     | Pull input queues, send network messages, expose debug/render state.                      |
| Client networking  | `client/src/net.ts`                      | WebSocket connection, reconnect client behavior, snapshot/event receipt.                  |
| Client render      | `client/src/render.ts`                   | Canvas world rendering, HUD, panels, command markers, visual affordances.                 |
| Room orchestration | `server/src/loop.ts`                     | Authoritative room tick, ingest messages, mutate world, emit snapshots/events.            |
| Movement sim       | `server/src/sim/movement.ts`             | Tank movement, command destination stepping, movement fuel cost.                          |
| Combat sim         | `server/src/sim/combat.ts`               | Shot creation, fire costs, projectile behavior, fire cooldowns.                           |
| Damage sim         | `server/src/sim/damage.ts`               | Fuel-as-health damage, shield damage modification, kill result.                           |
| Economy sim        | `server/src/sim/economy.ts`              | Fuel debit/restore helpers and action costs.                                              |
| Vision sim         | `server/src/sim/vision.ts`               | Per-viewer hidden pickup/mine visibility and radar reveal rules.                          |
| World sim          | `server/src/sim/world.ts`                | Tank spawn/respawn, pickup spawn/refuel helpers, world constants.                         |
| Mine sim           | `server/src/sim/mines.ts`                | Mine placement, detonation, masking-related state.                                        |
| Rank sim           | `server/src/sim/rank.ts`                 | XP/rank calculation today; future promotion/demotion rules belong here.                   |
| Persistence/API    | `server/src/index.ts`, `server/prisma/*` | Auth/session wiring, DB persistence, leaderboards, future awards/tournaments/multi-tanks. |
| Tests              | `server/src/__tests__/loop.test.ts`      | Room-loop and server-owned behavior tests. Add focused tests here before broad refactors. |

## Local Model Execution Protocol

For each ticket below:

1. Read only the listed files plus direct imports needed to understand them.
2. Write down the intended behavior in one sentence in `progress.md`.
3. Add or update a focused test first when the behavior is server-owned.
4. Implement the smallest working slice.
5. Run the required validation commands.
6. Run a browser/Playwright check when the ticket changes visible gameplay.
7. Commit with the suggested commit message.
8. Push `main`.
9. Start the next ticket only after the working tree is clean.

Required validation for every ticket:

```bash
npm test
npm run typecheck
npm run format:check
npm run build
```

Browser validation is required for tickets tagged `browser-check`.

## Local Model Ticket Queue

The broad phases later in this file explain why the work matters. This queue is
the exact chunking a local model should follow.

### Ticket 1.1 - Add `FIRE_AT` Protocol Shape

Tag: server-owned

Goal: define a target-based fire message without changing gameplay yet.

Files:

- `shared/types.ts`
- `server/src/loop.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Add `ClientMessageType.FIRE_AT`.
- Add message fields: `x`, `y`, optional `targetId`, optional `weaponMode`, and
  `clientTick`.
- Add a no-op or minimally routed server handler that validates the message but
  does not break existing `INPUT`/fire behavior.
- Add test: `ingests FIRE_AT command without breaking existing fire input`.

Acceptance:

- Existing fire behavior still works.
- New protocol compiles and can be ingested by the server.
- No client UI changes yet.

Suggested commit: `Add fire-at protocol message`

### Ticket 1.2 - Server-Resolve `FIRE_AT` Projectile Direction

Tag: server-owned

Goal: make `FIRE_AT` create projectiles from tank position toward target
coordinates.

Files:

- `server/src/loop.ts`
- `server/src/sim/combat.ts`
- `shared/types.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Route `FIRE_AT` into existing projectile creation.
- Compute aim server-side from tank position to target coordinate.
- Preserve fuel cost and fire cooldown behavior.
- Add tests:
  - `fire-at creates a projectile moving right`
  - `fire-at creates a projectile moving left`
  - `fire-at creates a projectile moving up`
  - `fire-at creates a projectile moving down`

Acceptance:

- Client-provided aim angle is not required for `FIRE_AT`.
- Direction tests pass with deterministic projectile vectors.
- Existing Space/right-click fire still works until client migration completes.

Suggested commit: `Resolve fire-at direction on server`

### Ticket 1.3 - Route Double-Click To `FIRE_AT`

Tag: browser-check

Goal: match original Battlefield double-click fire.

Files:

- `client/src/input.ts`
- `client/src/loop.ts`
- `client/src/render.ts`
- `progress.md`

Steps:

- Detect double-click on the canvas.
- Queue `FIRE_AT` with the double-click world coordinate.
- Avoid also issuing a move command on the second click.
- Update HUD control text to mention double-click fire.
- Browser-check: double-click right and left of the tank and confirm projectile
  direction changes.

Acceptance:

- Double-click fires at the clicked point.
- Single-click still moves.
- No stale-direction shooting.

Suggested commit: `Add double-click fire input`

### Ticket 1.4 - Route Space To `FIRE_AT`

Tag: browser-check

Goal: keep Space fire while using the target-command model.

Files:

- `client/src/input.ts`
- `client/src/loop.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- On Space, send `FIRE_AT` using the latest cursor world coordinate.
- Keep legacy fire fallback only if needed for compatibility.
- Add/adjust test proving `FIRE_AT` remains server-resolved.
- Browser-check: move cursor to four directions and press Space.

Acceptance:

- Space fires toward cursor.
- Shooting direction is not stuck after moving the mouse.

Suggested commit: `Route space fire through fire-at`

### Ticket 1.5 - Add Equipment Toggle Protocol Only

Tag: server-owned

Goal: introduce classic equipment mode state without changing combat effects yet.

Files:

- `shared/types.ts`
- `server/src/loop.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Add equipment mode state for shield, dual, missile, homing, and extra radar.
- Add `TOGGLE_EQUIPMENT` client message with a mode field.
- Server toggles mode state only when the tank has the relevant equipment count
  where applicable.
- Add tests:
  - `toggles shield mode when shield equipment remains`
  - `does not toggle unavailable equipment mode`
  - `clears incompatible modes if needed`

Acceptance:

- Snapshot includes active equipment modes.
- Counts do not go negative.
- No combat behavior changes yet except shield if existing shield behavior is
  already wired.

Suggested commit: `Add classic equipment toggle state`

### Ticket 1.6 - Bind Number Keys To Equipment Toggles

Tag: browser-check

Goal: match original `1`-`5` equipment hotkeys.

Files:

- `client/src/input.ts`
- `client/src/loop.ts`
- `client/src/render.ts`
- `progress.md`

Steps:

- Bind `1` shield, `2` dual, `3` missile, `4` homing, `5` extra radar.
- Render active mode and count in HUD.
- Update control hint text.
- Browser-check: press each number and confirm HUD state changes or unavailable
  feedback appears.

Acceptance:

- Number keys affect server-owned equipment mode state.
- HUD shows active modes clearly.

Suggested commit: `Bind classic equipment number keys`

### Ticket 2.1 - Add Long-Press Interaction Message

Tag: server-owned

Goal: define click-and-hold pickup/drop without implementing all economy effects.

Files:

- `shared/types.ts`
- `client/src/input.ts`
- `client/src/loop.ts`
- `server/src/loop.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Add `INTERACT_HOLD` or `PICKUP_DROP` message with world coordinates.
- Client queues it after a deliberate long press.
- Server validates range and emits a harmless feedback event if no interactable
  exists.
- Add test: `rejects hold interaction outside pickup range`.

Acceptance:

- Long press does not break single-click movement.
- Server owns range validation.

Suggested commit: `Add click-hold interaction command`

### Ticket 2.2 - Pick Up Visible Fuel And Equipment

Tag: server-owned browser-check

Goal: make click-and-hold collect visible nearby pickups.

Files:

- `server/src/loop.ts`
- `server/src/sim/world.ts`
- `server/src/sim/economy.ts`
- `server/src/sim/vision.ts`
- `client/src/render.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- On valid hold interaction, collect nearby visible pickup.
- Apply existing fuel/equipment pickup effects.
- Emit pickup feedback event.
- Add tests:
  - `hold interaction collects nearby visible fuel`
  - `hold interaction cannot collect hidden distant pickup`

Acceptance:

- Fuel/equipment collection can be command-driven.
- Hidden pickup visibility rules remain intact.

Suggested commit: `Collect pickups with hold interaction`

### Ticket 2.3 - Add Fuel Deposit

Tag: server-owned browser-check

Goal: implement the Battlefield fuel logistics loop.

Files:

- `shared/types.ts`
- `server/src/sim/economy.ts`
- `server/src/sim/world.ts`
- `server/src/loop.ts`
- `client/src/input.ts`
- `client/src/render.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Add deposit command or use hold interaction with a deposit modifier.
- Choose a conservative deposit amount and minimum remaining fuel.
- Server removes fuel from tank and creates a fuel pickup at/near tank position.
- Add tests:
  - `fuel deposit reduces tank fuel and creates fuel pickup`
  - `fuel deposit is blocked below minimum reserve`

Acceptance:

- Fuel can be placed on the map by players.
- Deposit pickup obeys existing visibility/proximity/radar rules.

Suggested commit: `Add fuel deposit command`

### Ticket 3.1 - Add Dual Shot Effect

Tag: server-owned browser-check

Goal: make `dual` mode affect `FIRE_AT`.

Files:

- `server/src/sim/combat.ts`
- `server/src/loop.ts`
- `shared/types.ts`
- `client/src/render.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- When dual mode is active, create paired shots or a stronger shot.
- Increase fuel/equipment cost.
- Add test: `dual mode creates paired projectiles with extra cost`.

Acceptance:

- Dual shot is visible and costs more than standard fire.
- Mode state remains server-authoritative.

Suggested commit: `Add dual shot equipment effect`

### Ticket 3.2 - Add Missile Mode Effect

Tag: server-owned browser-check

Goal: make `missile` mode convert `FIRE_AT` into missile behavior.

Files:

- `server/src/sim/combat.ts`
- `server/src/loop.ts`
- `shared/types.ts`
- `client/src/render.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Use existing missile projectile type when missile mode is active.
- Consume missile equipment/count and fuel.
- Disable missile mode when depleted.
- Add test: `missile mode consumes missile equipment and fires missile`.

Acceptance:

- Missile mode is toggled, count-limited, and visible in HUD.

Suggested commit: `Add missile equipment mode effect`

### Ticket 3.3 - Add Homing Mode Effect

Tag: server-owned browser-check

Goal: add target-tracking behavior behind homing mode.

Files:

- `shared/types.ts`
- `server/src/sim/combat.ts`
- `server/src/loop.ts`
- `client/src/render.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Require a `targetId` for homing behavior; otherwise fall back to missile or
  standard shot.
- Add bounded turn rate or simple periodic direction correction.
- Consume homing/missile resources.
- Add test: `homing projectile tracks selected target within turn limit`.

Acceptance:

- Homing cannot target allies unless design explicitly allows it.
- Homing does not create impossible instant turns.

Suggested commit: `Add homing equipment mode effect`

### Ticket 3.4 - Add Extra Radar Mode Effect

Tag: server-owned browser-check

Goal: make extra radar stronger than normal radar without leaking hidden data.

Files:

- `shared/types.ts`
- `server/src/sim/vision.ts`
- `server/src/loop.ts`
- `client/src/render.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Add extra radar radius or reveal duration.
- Consume extra radar equipment/count and fuel.
- Add tests:
  - `extra radar reveals farther pickups than normal radar`
  - `extra radar does not reveal entities outside extra range`

Acceptance:

- Normal radar still works.
- Extra radar has a clear HUD/render distinction.

Suggested commit: `Add extra radar equipment effect`

### Ticket 4.1 - Add Information Panel State Machine

Tag: browser-check

Goal: create a reusable client overlay mechanism before adding all panels.

Files:

- `client/src/input.ts`
- `client/src/render.ts`
- `client/src/loop.ts`
- `progress.md`

Steps:

- Add local panel state for one active panel at a time.
- Add timeout or close behavior.
- Render a compact panel that does not hide the tank.
- Bind `I` to an inventory panel first.

Acceptance:

- `I` opens/closes inventory.
- Panel text fits desktop and mobile viewports.

Suggested commit: `Add compact game information panels`

### Ticket 4.2 - Add Nearest Enemy And Locator Panels

Tag: browser-check

Goal: implement classic tactical information hotkeys.

Files:

- `client/src/input.ts`
- `client/src/render.ts`
- `client/src/loop.ts`
- `shared/types.ts` if snapshot additions are needed.
- `progress.md`

Steps:

- Bind `E` to nearest enemy.
- Bind `L` to locator.
- Use existing snapshot tanks where possible.
- Show direction/distance instead of large instructional copy.

Acceptance:

- Player can quickly find nearest visible enemy.
- Locator state is compact and readable.

Suggested commit: `Add nearest enemy and locator panels`

### Ticket 4.3 - Add Active Players And Forces Panels

Tag: browser-check

Goal: implement team/player situational panels.

Files:

- `client/src/input.ts`
- `client/src/render.ts`
- `client/src/loop.ts`
- `shared/types.ts` if needed.
- `progress.md`

Steps:

- Bind `F` to active forces.
- Bind `?` to active players.
- Group by troop color/team.
- Keep panel compact.

Acceptance:

- Player can see team balance and active battle population.

Suggested commit: `Add active players and forces panels`

### Ticket 5.1 - Add Command Cadence Constant

Tag: server-owned

Goal: introduce command-turn timing without changing behavior significantly.

Files:

- `shared/types.ts`
- `server/src/loop.ts`
- `server/src/sim/movement.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Add a command cadence constant.
- Gate movement command progression through cadence while keeping snapshots at
  current tick rate.
- Add test: `move command advances only on command cadence`.

Acceptance:

- Movement remains playable.
- Command spam does not bypass cadence.

Suggested commit: `Add command cadence for movement`

### Ticket 5.2 - Gate Fire And Equipment By Cadence

Tag: server-owned browser-check

Goal: make combat/equipment resolution feel turn-command based.

Files:

- `server/src/loop.ts`
- `server/src/sim/combat.ts`
- `server/src/sim/equipment.ts` if present.
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Apply cadence/cooldown to `FIRE_AT`.
- Apply cadence/cooldown to equipment toggles if needed.
- Add test: `repeated fire-at commands cannot bypass cadence`.

Acceptance:

- Firing feels deliberate.
- Rapid repeated commands do not create extra free shots.

Suggested commit: `Gate fire commands by cadence`

### Ticket 6.1 - Add Map Manifest Type And Loader

Tag: server-owned

Goal: define map data before implementing map mechanics.

Files:

- `shared/types.ts`
- new `server/src/sim/map.ts`
- `server/src/loop.ts`
- new map JSON location, for example `client/public/maps/rocks-and-swamp.json`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Define map manifest shape: id, name, dimensions, terrain, water, spawn zones,
  pickup zones, obstacle starts, ferry routes.
- Add a minimal `Rocks and Swamp` manifest with placeholders.
- Load the manifest into room initialization.
- Add test: `loads rocks and swamp map manifest`.

Acceptance:

- Current flat map still works if map load fails.
- Map data is deterministic and committed.

Suggested commit: `Add Battlefield map manifest loader`

### Ticket 6.2 - Add Terrain And Water Collision

Tag: server-owned browser-check

Goal: make map terrain affect movement.

Files:

- `server/src/sim/map.ts`
- `server/src/sim/movement.ts`
- `server/src/loop.ts`
- `client/src/render.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Block tank movement through obstacle/water zones unless ferry rules allow it.
- Render terrain and water clearly.
- Add tests:
  - `movement stops at blocked terrain`
  - `movement cannot enter water without ferry`

Acceptance:

- Browser view shows readable terrain/water.
- Server collision is authoritative.

Suggested commit: `Add map terrain collision`

### Ticket 6.3 - Add Ferry Routes

Tag: server-owned browser-check

Goal: implement water transport.

Files:

- `server/src/sim/map.ts`
- `server/src/sim/movement.ts`
- `server/src/loop.ts`
- `client/src/render.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Add ferry route state from map manifest.
- Allow tanks on ferry lane/platform to cross water.
- Render ferry state.
- Add test: `ferry transports tank across water route`.

Acceptance:

- Ferries are interactive transport, not decoration.

Suggested commit: `Add ferry route transport`

### Ticket 6.4 - Add Movable Obstacles

Tag: server-owned browser-check

Goal: implement classic obstacle tactics.

Files:

- `shared/types.ts`
- `server/src/sim/map.ts`
- `server/src/loop.ts`
- `client/src/input.ts`
- `client/src/render.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Represent obstacles as server-owned entities.
- Allow hold interaction to pick/drag/drop an obstacle within limits.
- Apply obstacle collision after movement/drop.
- Add tests:
  - `tank cannot pass through obstacle`
  - `hold interaction moves obstacle within allowed range`

Acceptance:

- Obstacles can be moved for tactics.
- Dropped obstacles cannot trap tanks in invalid terrain.

Suggested commit: `Add movable map obstacles`

### Ticket 7.1 - Add Rank Demotion On Deactivation

Tag: server-owned

Goal: implement one classic progression behavior before broader persistence work.

Files:

- `server/src/sim/rank.ts`
- `server/src/loop.ts`
- `server/src/index.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Define demotion rule on deactivation.
- Keep highest-rank history if current schema supports it.
- Add test: `deactivation demotes current rank but preserves highest rank`.

Acceptance:

- Deactivation has meaningful progression cost.
- Existing leaderboard sort does not break.

Suggested commit: `Add deactivation rank demotion`

### Ticket 7.2 - Add Promotion Requirement Hooks

Tag: server-owned

Goal: prepare ranks for required deactivations of qualified opponents.

Files:

- `server/src/sim/rank.ts`
- `server/src/loop.ts`
- `shared/types.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Add rank requirement table separate from XP thresholds.
- Track qualifying deactivation counters in memory first if schema migration is
  too large.
- Add test: `rank promotion waits for qualifying deactivation requirement`.

Acceptance:

- XP alone cannot promote into gated ranks.
- Data model can later persist the counters.

Suggested commit: `Add promotion requirement hooks`

### Ticket 7.3 - Add Awards Data Model

Tag: server-owned

Goal: introduce awards without trying to implement every medal at once.

Files:

- `server/prisma/schema.prisma`
- `server/src/index.ts`
- `shared/types.ts`
- tests where repo convention supports persistence tests.
- `progress.md`

Steps:

- Add minimal award enum/table shape.
- Add placeholder award assignment helper.
- Expose awards in tank/profile/leaderboard data if already available.
- Document migration command if Prisma migration is required.

Acceptance:

- Schema supports future awards.
- Existing auth/leaderboard flow still works.

Suggested commit: `Add tank awards data model`

### Ticket 8.1 - Add Combat Lock State

Tag: server-owned

Goal: prevent safe quit during combat.

Files:

- `shared/types.ts`
- `server/src/connection.ts`
- `server/src/loop.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Track last dealt/taken damage tick.
- Mark tank combat-locked for a fixed duration.
- Expose combat-lock state if useful for HUD.
- Add test: `damage applies combat lock to attacker and victim`.

Acceptance:

- Combat lock starts on damage.
- Combat lock expires after duration.

Suggested commit: `Add combat lock state`

### Ticket 8.2 - Keep Disconnected Combat-Locked Tanks In World

Tag: server-owned browser-check

Goal: prevent closing tab from instantly removing a tank mid-fight.

Files:

- `server/src/connection.ts`
- `server/src/loop.ts`
- `server/src/index.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- On disconnect, leave combat-locked tank in the room for timeout duration.
- Prevent input while disconnected.
- Deactivate or remove after timeout based on design.
- Add test: `combat locked disconnect leaves tank temporarily in world`.

Acceptance:

- Non-combat disconnect can still clean up quickly.
- Combat-locked disconnect cannot dodge danger.

Suggested commit: `Preserve combat locked disconnects`

### Ticket 8.3 - Reconnect To Existing Tank

Tag: server-owned browser-check

Goal: let a player resume battle after a brief disconnect.

Files:

- `server/src/connection.ts`
- `server/src/index.ts`
- `server/src/loop.ts`
- `client/src/net.ts`
- `server/src/__tests__/loop.test.ts`
- `progress.md`

Steps:

- Identify reconnectable session/tank.
- Rebind a new connection to the preserved tank if timeout has not expired.
- Add test: `reconnect within timeout resumes preserved tank`.

Acceptance:

- Reconnect is possible within timeout.
- Reconnect cannot hijack another player's tank.

Suggested commit: `Reconnect preserved battle tanks`

### Ticket 9.1 - Modern Skin Foundation

Tag: browser-check

Goal: improve visuals without changing mechanics or copying assets.

Files:

- `client/src/render.ts`
- client public assets if original/permissive assets are added.
- `progress.md`

Steps:

- Improve tank, terrain, projectile, radar, and pickup visuals using original
  Canvas drawing or permissive assets.
- Keep HUD dense and readable.
- Avoid landing-page, card-heavy, or decorative-only visuals.
- Browser-check desktop and mobile viewport screenshots.

Acceptance:

- Game is playable immediately on first screen.
- Text does not overlap on desktop/mobile.
- Visuals communicate mechanics clearly.

Suggested commit: `Modernize Battlefield gameplay skin`

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
