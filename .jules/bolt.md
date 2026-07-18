## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.
## 2025-02-17 - Avoid Iterable iterations overhead on hot loop

**Learning:** While `EntityMap` caches `.valuesArray()` internally to avoid creating a new iterator over the map elements every time, we still need to pay attention when that map/array is passed around. For example, iterating over `Iterable<T>` (via `.values()` which was passed to `findHit`, `stepMineDetonations`, etc.) will still spawn new iterators and cause heavy GC pressure in hot loops (like game tick simulation). By accepting `readonly T[]` and supplying `EntityMap.valuesArray()`, we can eliminate all allocations. We also shouldn't spread these arrays (`[...tanks]`) as it creates a new copy.
**Action:** In game loop hotpaths, always prefer cached array iterations like `.valuesArray()` over `.values()`, avoid spreading variables like `[...tanks]`, and update consumer functions to accept `readonly T[]` directly instead of `Iterable<T>`.
