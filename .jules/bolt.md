## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-05-18 - Avoid Iterator Allocations in Hot Paths

**Learning:** Iterator allocations (`Array.from`, `[...iterable]`, and `Map.values()`) inside hot loops (like game tick simulation in `arena.ts`) cause significant GC pressure.
**Action:** Replace `Iterable<T>` with typed arrays (`readonly T[]`) in hot-path signatures and refactor `for...of` loops to indexed `for` loops utilizing custom cached properties like `EntityMap.valuesArray()`.

## 2024-05-18 - Caching Pitfalls with Snapshot Arrays

**Learning:** In stateful simulation ticks (like `server/src/loop.ts`), caching array representations of maps at the start of the tick and reusing them at the end of the tick (for broadcasting state) leads to stale data bugs. Entities deleted mid-tick are still present in the initial array reference.
**Action:** When using cached arrays like `EntityMap.valuesArray()`, call `.valuesArray()` at the exact moment the data is needed, relying on the class's internal invalidation to avoid allocations, rather than holding a manual reference across mutating operations.
