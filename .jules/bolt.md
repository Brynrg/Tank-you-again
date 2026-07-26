## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-26 - Optimizing iteration over entity collections
**Learning:** Iterating over `Iterable<T>` generated from `Map.values()` inside hot loops like `loop.ts` and `arena.ts` results in internal spread operator overhead `[...iterable]` or manual allocation for `for (const x of map.values())`. The custom `EntityMap` caches these values as an array using `.valuesArray()`.
**Action:** Use `.valuesArray()` in `loop.ts`, `arena.ts`, and change function signatures (`findHit`, `stepMineDetonations`, `computeVisionSet`, `scanRadar`) from `Iterable<T>` to `readonly T[]` to avoid iterator allocation in $O(N)$ operations.
