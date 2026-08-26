## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2026-08-26 - Optimizing inner loop array allocations with EntityMap

**Learning:** When hot loop methods (e.g. `stepMineDetonations`, `findHit`, `computeVisionSet`) iterate over simulation entity maps, relying on `.values()` or spread operators (e.g., `[...tanks]`) causes excessive (N)$ iteration and temporary array allocations.
**Action:** Utilize the custom `EntityMap.valuesArray()` cache and refactor function signatures to accept `readonly Array<T>` along with index-based `for` loops for highly efficient hot-path processing without GC thrashing.
