## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-23 - Optimizing Map iterators in hot paths

**Learning:** Passing `Map.values()` iterators to functions and using internal spread operators (e.g. `[...tanks]`) in game loop hot paths causes high allocation overhead.
**Action:** Used `readonly EntityMap.valuesArray()` everywhere and changed utility function parameters (e.g., `findHit`, `stepMineDetonations`, `scanRadar`, `computeVisionSet`) to accept `readonly T[]` instead of `Iterable<T>`. This bypasses temporary allocations and internal spread operations.
