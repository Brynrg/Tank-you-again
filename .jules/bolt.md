## 2023-10-27 - EntityMap optimization

**Learning:** In the game loop (e.g., `server/src/loop.ts` and `shared/sim/arena.ts`), constantly calling `Array.from()` on standard `Map` collections (like `tanks`, `projectiles`, `mines`, and `pickups`) to populate `cachedWorldState` causes heavy array allocations and memory thrashing.
**Action:** Replace `Map` collections with the custom `EntityMap` class (`shared/sim/entity-map.ts`) and use `.valuesArray()` to cache and reuse the array, allocating a new one only upon map mutation.
