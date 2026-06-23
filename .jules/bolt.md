## 2024-06-23 - O(N) Array Iteration Allocation Caching

**Learning:** The game loop processes game states every tick, resulting in frequent allocations (e.g. `Array.from()`) for arrays generated from ES6 maps.
**Action:** Created `EntityMap` structure to proxy underlying map mutations and cache `.valuesArray()`. Replaced large `Map` instances in `arena.ts` and `loop.ts` to `EntityMap` for tanks, projectiles, mines, and pickups to decrease repeated memory allocations on hot loops.
