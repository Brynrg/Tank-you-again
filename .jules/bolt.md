## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.
## 2024-08-08 - Optimized Entity Iteration in Game Loops
**Learning:** Converting Map iterables to arrays in hot simulation loops (like game loop ticks) via `Array.from()` or the spread operator (e.g. `[...tanks]`) causes excessive GC churn and impacts performance.
**Action:** Replaced `.values()` with `EntityMap.valuesArray()` for zero-allocation array retrieval in game tick hot paths, passed `readonly Type[]` to collision/vision systems, and substituted internal `for...of` loop iterators with explicit index-based `for` loops.
