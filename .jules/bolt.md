## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-07 - Replace Iterables with Readonly Arrays in hot-path simulation functions

**Learning:** `findHit`, `stepMineDetonations`, and `computeVisionSet`/`scanRadar` iterate over elements and were accepting `Iterable<T>`. When called from the hot loop (game tick), using `.values()` generates new iterator objects every time, creating unnecessary GC pressure. Passing the already-cached array (`.valuesArray()`) as `readonly T[]` is more efficient because iterating arrays without spread avoids iterator allocations, and we were already maintaining a custom `EntityMap` caching mechanism meant to fix exactly this.
**Action:** Change signatures in hot-path functions (`combat.ts`, `mines.ts`, `vision.ts`) to accept `readonly T[]` instead of `Iterable<T>`, and pass `.valuesArray()` from the caller (e.g. `arena.ts`, `loop.ts`).
