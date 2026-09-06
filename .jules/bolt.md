## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2026-09-06 - Array Spread and Iterator Allocation in Hot Loops

**Learning:** In very hot loops (like game ticks), calling `[...iterable]` or repeatedly allocating `for...of` iterators over large collections causes major GC thrashing and performance degradation.
**Action:** Use cached arrays like `EntityMap.valuesArray()` and standard index-based `for (let i = 0; i < len; i++)` loops to eliminate allocations on the hot path.
