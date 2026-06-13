## 2025-06-13 - [EntityMap Allocation Caching]

**Learning:** Hot loops in the game engine (like `updateAIEnemies` inside `loop.ts` and `arena.ts`) suffer memory thrashing from repeatedly calling `Array.from(map.values())` when preparing world state for bots, especially since bot processing happens multiple times per second.
**Action:** Use the custom `EntityMap` class (now in `shared/sim/entity-map.ts`) instead of standard Maps for active entities. Call `.valuesArray()` which caches the array allocation upon mutation instead of generating a new array on every read request.
