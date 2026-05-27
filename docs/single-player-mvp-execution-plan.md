# Tank You Again — Single Player MVP Execution Plan

**Repository:** `Brynrg/Tank-you-again`
**Plan status:** Execution-ready
**Target reader:** Local AI coding agent
**Primary goal:** Add a safe server-side single-player MVP with AI tanks while preserving existing multiplayer behavior.
**Non-goal for this pass:** Do not implement campaign mode, survival waves, destructible terrain, power-ups, moving obstacles, browser-local simulation, or Web Worker simulation.

---

## 0. Architecture Decision for This Pass

### Decision

Implement the first single-player MVP using **server-side AI inside the existing authoritative `RoomLoop`**.

### Why

The current game is already built around shared TypeScript protocol/state types, server-authoritative simulation, WebSocket transport, client rendering from server snapshots, and existing movement/combat/mine/pickup/projectile systems.

Adding AI inside the current server loop is the fastest way to get a playable player-vs-bots mode without rewriting the game architecture.

### Known Tradeoff

Single-player sessions will still consume server/Fly.io resources and will still have network latency. This is acceptable for the MVP but is not the long-term ideal architecture.

### Mitigation

All new AI modules should be written as dependency-light, pure-ish, module-level functions so they can later be moved toward `shared/sim/` and used by a browser-local simulation runner or Web Worker.

### Future Target Architecture

MULTIPLAYER -> WebSocket NetClient -> server RoomLoop
SINGLE_PLAYER -> browser-local SimRunner/Web Worker -> same snapshot shape

Do not implement the future browser-local path in this pass.

---

## 1. Hard Rules

1. Inspect the repository before editing.
2. Preserve existing multiplayer behavior.
3. Do not rewrite `RoomLoop` wholesale.
4. Do not create fake WebSocket connections for AI tanks.
5. Do not add `GameMode.BOTH`.
6. Do not add a separate `aiTanks` array to `GameStateSnapshot`.
7. AI tanks must be normal `TankState` objects in the existing tanks map and normal snapshot `tanks` array.
8. Reuse existing movement, combat, damage, mine, pickup, respawn, and projectile systems.
9. Use existing `tryFire()` for AI firing.
10. Do not assume fields that do not exist, such as `isAlive`, `vx`, `vy`, `gameState.mines`, or `fireProjectile`.
11. Do not use `Date.now()` for simulation decisions. Use server ticks.
12. Use module-level functions, not static-only Java-style classes.
13. AI randomness must be injectable or seedable for deterministic tests.
14. One logical change per commit if committing is available.
15. Run validation before the final report.

---

## 2. Inspect First

Before making changes, inspect these files:

package.json
shared/types.ts
server/src/loop.ts
server/src/loop-types.ts
server/src/index.ts
server/src/connection.ts
server/src/sim/world.ts
server/src/sim/movement.ts
server/src/sim/combat.ts
server/src/sim/damage.ts
server/src/sim/mines.ts
server/src/sim/vision.ts
client/src/loop.ts
client/src/net.ts
client/src/input.ts
client/src/render.ts
client/src/main.ts

Run baseline validation before edits:

npm run typecheck
npm test
npm run build

If baseline validation fails before edits, record the exact output and continue only if the failure is unrelated to this work.

---

## 3. Phase 1 — Shared Types

### File

shared/types.ts

### Add Enums

Add these shared enums near the existing enum section:

export enum GameMode {
  MULTIPLAYER = "MULTIPLAYER",
  SINGLE_PLAYER = "SINGLE_PLAYER",
}

export enum TankControllerKind {
  PLAYER = "PLAYER",
  AI = "AI",
}

export enum AIPersonality {
  AGGRESSIVE = "AGGRESSIVE",
  DEFENSIVE = "DEFENSIVE",
  BALANCED = "BALANCED",
}

export enum DifficultyLevel {
  EASY = 1,
  MEDIUM = 2,
  HARD = 3,
  EXPERT = 4,
}

### Extend `TankState`

Add optional AI-safe fields to the existing `TankState` interface:

controller?: TankControllerKind;

ai?: {
  personality: AIPersonality;
  difficulty: DifficultyLevel;
  targetTankId: string | null;
  lastDecisionTick: number;
  lastAction: string;
};

These fields must be optional so existing multiplayer code remains compatible.

### Extend `ClientAuthMessage`

Add:

gameMode?: GameMode;

### Extend `ServerWelcomeMessage`

Add:

gameMode?: GameMode;

### Extend `GameStateSnapshot`

Add:

gameMode?: GameMode;

### Do Not Change

Do not remove or rename existing snapshot fields. In particular, preserve `visibleMines` exactly as-is.

### Acceptance Criteria

- Existing multiplayer messages still compile.
- A client that does not send `gameMode` defaults to multiplayer.
- Snapshot shape remains compatible with current client renderer.
- No `aiTanks` array exists in the snapshot.
- No `GameMode.BOTH` exists.

---

## 4. Phase 2 — RoomLoop Mode Support

### Files

server/src/loop.ts
server/src/index.ts
server/src/connection.ts

Also inspect any other file that creates or owns `RoomLoop` instances.

### Add Room Options

Add or adapt a room options interface:

interface RoomLoopOptions {
  gameMode?: GameMode;
  aiDifficulty?: DifficultyLevel;
  aiCount?: number;
}

### Defaults

Use these defaults:

gameMode = GameMode.MULTIPLAYER
aiDifficulty = DifficultyLevel.MEDIUM
aiCount = 3

Current multiplayer room creation must still work without new required arguments.

### Add Private Room State

Inside `RoomLoop`, add private fields equivalent to:

private readonly gameMode: GameMode;
private readonly aiDifficulty: DifficultyLevel;
private readonly aiCount: number;
private aiInitialized = false;

private readonly aiCombatState = new Map<
  string,
  {
    lastBulletTick: number;
    lastMissileTick: number;
    lastMineTick: number;
  }
>();

Add a server-only AI brain state map if needed, keyed by tank id. Keep server-only brain state out of the network snapshot unless the client truly needs it.

### Mode Rules

Only these parts of the system should need mode awareness:

1. room creation/auth
2. AI spawn
3. AI decision step
4. snapshot `gameMode`

Do not scatter `if SINGLE_PLAYER` checks across unrelated mechanics.

### Acceptance Criteria

- Multiplayer default still works with no mode sent.
- Single-player mode can be requested.
- No AI tanks spawn in multiplayer rooms.
- Snapshot includes or safely defaults `gameMode`.

---

## 5. Phase 3 — AI Spawn

### New File

server/src/sim/ai-spawn.ts

### Export Types and Function

export interface SpawnAIOptions {
  count: number;
  difficulty: DifficultyLevel;
  currentTick: number;
  existingTanks: Iterable<TankState>;
  rng?: () => number;
}

export function spawnAITanks(opts: SpawnAIOptions): TankState[];

### AI Tank Rules

AI tanks must:

- be normal `TankState` objects
- use an id like `ai-${randomUUID()}` or equivalent
- set `controller: TankControllerKind.AI`
- set `ai` metadata
- use valid `TeamColor` values
- use `MilitaryRank.RECRUIT` unless existing `makeTank()` requires a better default
- spawn inside map bounds
- spawn at least 350 world units from human/player tanks
- spawn at least 120 world units from any tank
- use a max of 50 random attempts per tank
- use deterministic fallback spawn positions near map edges/corners

Prefer existing `makeTank()` from `server/src/sim/world.ts` if compatible.

### Personality Assignment

Cycle personalities in this order:

BALANCED
AGGRESSIVE
DEFENSIVE

Example:

AI 1 -> BALANCED
AI 2 -> AGGRESSIVE
AI 3 -> DEFENSIVE
AI 4 -> BALANCED

### Acceptance Criteria

- AI spawn returns the requested count when possible.
- AI tanks are inserted later into the same `this.tanks` map as players.
- AI tanks appear in normal snapshots through `tanks`.
- AI tanks can be damaged by existing projectile collision.
- AI tanks can trigger existing mines/pickups unless intentionally excluded later.

---

## 6. Phase 4 — AI Controller

### New File

server/src/sim/ai-controller.ts

### Style Rule

Use module-level exports. Do not create a static-only class.

### Export `AIIntent`

export interface AIIntent {
  moveTarget: { x: number; y: number } | null;
  aim: number;
  fireBullet: boolean;
  fireMissile: boolean;
  placeMine: boolean;
  useShield: boolean;
  useRadar: boolean;
  teleportTarget: { x: number; y: number } | null;
  actionLabel: string;
}

### Export `decideAIIntent`

export function decideAIIntent(args: {
  aiTank: TankState;
  tanks: Iterable<TankState>;
  visibleMines: Iterable<MineState>;
  projectiles: Iterable<ProjectileState>;
  currentTick: number;
  rng?: () => number;
}): AIIntent;

### Targeting Rules

- Target the nearest living non-AI tank.
- Living means `isDead === false`.
- Ignore other AI tanks as targets.
- If no target exists, produce a wander/patrol intent.

### Difficulty Rules

Decision interval by difficulty:

EASY -> 18 ticks
MEDIUM -> 12 ticks
HARD -> 8 ticks
EXPERT -> 5 ticks

Aim error by difficulty should be handled in `ai-combat.ts`, but the controller should respect the difficulty when deciding how frequently to update or fire.

### Personality Rules

#### AGGRESSIVE

- desired range: 180–260
- closes distance more often
- fires more often
- prefers missiles earlier if available

#### DEFENSIVE

- desired range: 350–500
- retreats if too close
- more likely to shield or place mines
- avoids direct close combat

#### BALANCED

- desired range: 250–400
- alternates between chase, strafe, and fire

### Movement Rules

Use steering-style behavior for MVP:

1. seek target if too far
2. flee target if too close
3. strafe if in ideal range
4. avoid map edges
5. avoid visible/known mines within 120 units

Do not implement full pathfinding, A*, flow fields, destructible navigation, or wall navigation in this phase.

### Output Rules

- `moveTarget` must be inside map bounds.
- `aim` must be finite.
- Do not assume target velocity exists.
- Do not use `Date.now()`.
- Use the injected `rng` if randomness is needed.

### Acceptance Criteria

- AI picks a target.
- AI ignores dead tanks.
- AI ignores other AI tanks.
- AI produces stable movement intent.
- AI behavior differs by personality/difficulty.
- AI movement target is bounded.
- AI aim is finite.

---

## 7. Phase 5 — AI Combat

### New File

server/src/sim/ai-combat.ts

### Style Rule

Use module-level exports. Do not create a static-only class.

### Export `calculateAIAim`

export function calculateAIAim(args: {
  aiTank: TankState;
  target: TankState;
  difficulty: DifficultyLevel;
  currentTick: number;
  rng?: () => number;
}): number;

### Export `chooseAIWeapon`

export function chooseAIWeapon(args: {
  aiTank: TankState;
  target: TankState;
  distance: number;
  difficulty: DifficultyLevel;
  personality: AIPersonality;
  rng?: () => number;
}): ProjectileKind | null;

### Aim Rules

Use direct aim first:

Math.atan2(target.y - aiTank.y, target.x - aiTank.x)

Add difficulty-based random aim error using `rng`:

EASY -> about ±0.35 radians
MEDIUM -> about ±0.20 radians
HARD -> about ±0.10 radians
EXPERT -> about ±0.04 radians

Do not assume `target.vx` or `target.vy` exists.

### Weapon Rules

- Choose bullet by default.
- Choose missile only if:
  - `aiTank.ammo.missiles > 0`
  - target is at longer range
  - difficulty/personality makes it reasonable
- Return `null` if AI should not fire.

### Critical Rule

Do not create projectiles inside `ai-combat.ts`. `RoomLoop` must call the existing `tryFire()` function from `server/src/sim/combat.ts`.

### Acceptance Criteria

- Aim is finite.
- Easier difficulties have more aim error.
- Missile is never selected when missile ammo is zero.
- Projectiles are only produced through existing `tryFire()` integration later.

---

## 8. Phase 6 — Wire AI into `RoomLoop`

### File

server/src/loop.ts

### Spawn Timing

Spawn AI tanks only once in `SINGLE_PLAYER` mode after the first human tank exists.

### Spawn Process

1. Call `spawnAITanks()`.
2. Insert each returned AI tank into `this.tanks`.
3. Initialize `aiCombatState` for each AI tank.
4. Mark `aiInitialized = true`.

### AI Step Timing

During each `tick()`:

1. Apply player movement/shield drain as currently done.
2. Run AI step.
3. Step projectiles.
4. Resolve mine detonations.
5. Spawn/collect pickups.
6. Emit snapshots.

AI should run before projectile stepping so AI-fired projectiles participate in the same tick flow.

### AI Step Behavior

For each AI tank:

- skip if `controller !== TankControllerKind.AI`
- if dead and respawn time reached, use existing `respawnTank()`
- otherwise call `decideAIIntent()`
- set `tank.turretAngle = intent.aim`
- if `intent.moveTarget` exists, move using existing `stepMoveCommand()` or an equivalent existing movement helper
- if `intent.fireBullet` or `intent.fireMissile`, call existing `tryFire()`
- insert returned projectile into `this.projectiles`
- update AI cooldown state

### AI Firing With `tryFire()`

Use the AI combat cooldown state, not `Connection` state.

Pseudo-code:

const combatState = this.aiCombatState.get(aiTank.id);
if (!combatState) return;

const weapon = intent.fireMissile ? ProjectileKind.MISSILE : ProjectileKind.BULLET;
const lastTick =
  weapon === ProjectileKind.MISSILE
    ? combatState.lastMissileTick
    : combatState.lastBulletTick;

const result = tryFire(aiTank, weapon, intent.aim, this.tickIndex, lastTick);

if (result.ok && result.projectile) {
  this.projectiles.set(result.projectile.id, result.projectile);
  if (weapon === ProjectileKind.MISSILE) combatState.lastMissileTick = this.tickIndex;
  else combatState.lastBulletTick = this.tickIndex;
}

### Equipment Use

For this MVP, shield/radar/mine/teleport AI can be minimal or deferred unless easy to integrate safely.

If implemented:

- use existing fuel/ammo costs
- use existing mine placement logic
- do not duplicate mechanism logic in AI policy files

### Snapshot

Add `gameMode` to snapshots.

### Acceptance Criteria

- AI spawns only in single-player mode.
- AI uses normal tank lifecycle.
- AI uses existing movement helper.
- AI fires through `tryFire()`.
- AI projectiles are normal projectiles.
- Existing damage/armor/death systems apply.
- Existing multiplayer behavior is not broken.

---

## 9. Phase 7 — Client Activation

### Files

client/src/loop.ts
client/src/net.ts
client/src/main.ts
shared/types.ts

### Add Mode to Run Options

In `client/src/loop.ts`, add optional `gameMode`:

export interface RunOptions {
  canvas: HTMLCanvasElement;
  wsUrl: string;
  guestName: string;
  gameMode?: GameMode;
}

### Add Mode to Net Client

In `client/src/net.ts`, add optional `gameMode` to `NetClientOptions`, store it, and send it in the auth message:

this.send({
  type: ClientMessageType.AUTH,
  guestName: this.guestName,
  gameMode: this.gameMode,
});

### URL Param Activation

Support the simplest activation first:

?mode=single -> GameMode.SINGLE_PLAYER
default -> GameMode.MULTIPLAYER
?mode=multi -> GameMode.MULTIPLAYER

Do not implement browser-local simulation now.

Do not implement a large menu unless `client/src/main.ts` already has a menu structure that makes this trivial.

### Acceptance Criteria

- `?mode=single` starts a single-player request.
- Default URL still starts multiplayer.
- WebSocket remains the transport for both modes in this phase.
- Client still renders from `snapshot.tanks`.

---

## 10. Phase 8 — Render and HUD MVP

### File

client/src/render.ts

### Rendering Rule

AI tanks are normal tanks in `snapshot.tanks`. Do not create a separate AI render path.

### Minimal Visual Polish

Add one or both:

- small `BOT` label near AI tanks
- small marker/icon for `controller === TankControllerKind.AI`

Use existing team colors unless changing color is trivial and safe.

### HUD Additions

Show minimal single-player state:

Mode: Single Player
Enemies Remaining: <living AI count>

Only show these when `snapshot.gameMode === GameMode.SINGLE_PLAYER`.

### Acceptance Criteria

- AI tanks are visually identifiable.
- HUD shows single-player mode.
- HUD shows living enemy count.
- Multiplayer HUD is not broken.

---

## 11. Phase 9 — Tests

Add tests using the existing test framework and style.

### Required Where Practical

1. AI spawn returns requested count.
2. AI spawn marks tanks as `controller: AI`.
3. AI spawn avoids human tank position.
4. AI target selection ignores dead tanks.
5. AI target selection ignores other AI tanks.
6. AI intent returns finite aim.
7. AI movement target is bounded.
8. AI weapon selection does not choose missiles without ammo.
9. `RoomLoop` defaults to multiplayer if practical to test.
10. Single-player mode spawns AI if practical to test.

### Deterministic RNG

AI functions that use randomness must accept:

rng?: () => number

Use injected RNG in tests.

### Acceptance Criteria

- Unit tests are deterministic.
- Tests do not require real WebSocket connections unless the existing repo already has integration helpers.
- Behavior logic can be tested with mock game states.

---

## 12. Validation

Run after implementation:

npm run typecheck
npm test
npm run build

Fix failures caused by this work.

If failures remain, report exact command output and root cause.

---

## 13. MVP Acceptance Criteria

The implementation is complete only when all of these are true or explicitly reported as blocked:

- Multiplayer remains the default.
- Existing multiplayer builds and still uses the existing path.
- `?mode=single` starts a single-player request.
- Single-player spawns one human tank and AI enemy tanks.
- AI tanks are normal tanks in `snapshot.tanks`.
- No `GameMode.BOTH` exists.
- No `aiTanks` snapshot array exists.
- AI tanks move independently.
- AI tanks aim at the player.
- AI tanks fire through the existing `tryFire()` / projectile system.
- Player can damage and kill AI tanks.
- AI tanks can damage and kill the player.
- No `Date.now()` is used for simulation decisions.
- Typecheck, tests, and build pass, or failures are documented exactly.

---

## 14. Known Deferred Work

Do not implement these in this pass:

### Survival Mode V1

- wave number
- enemy count scaling
- score
- restart button
- best score
- survival HUD

### Mission Mode

- fixed objectives
- mission briefing
- objective tracking
- completion rewards

### Campaign Mode

- multiple levels
- progression
- unlocks
- story screens

### AI Navigation V2

- raycasts
- coarse-grid A*
- flow fields
- destructible obstacle navigation
- wall-aware movement

### Browser-Local Simulation

- shared `SimEngine`
- local `ClientSimRunner`
- Web Worker simulation loop
- local snapshots/events
- offline single-player

### Host/Iframe Integration

- speedrungames host bridge changes
- score posting contract
- single-player resume contract
- leaderboard anti-cheat policy

Flag host/iframe needs before shipping anything that affects score posting, saved state, or parent-frame messaging.

---

## 15. End-of-Run Report Format

At the end of the implementation run, report in this exact structure:

1. Summary
2. Architecture choice confirmed
3. Files inspected
4. Files changed
5. New files added
6. How single-player is activated
7. Multiplayer compatibility notes
8. AI behavior implemented
9. Tests added
10. Validation results
11. Known limitations
12. Recommended next slice

---

## 16. Recommended Next Slice After MVP

After this MVP is working, the recommended next implementation slice is:

Survival Mode V1

Scope:

- tick-driven wave spawning
- wave number
- enemies remaining
- score
- best score
- restart flow
- basic HUD

Do not start campaign, destructible terrain, or browser-local simulation until the AI combat loop is fun and stable.
