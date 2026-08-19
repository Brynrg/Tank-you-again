## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-02 - Array allocations in hot loops via Iterable/spread and Array.from

**Learning:** Hot loops like game loop tick calling `findHit`, `stepMineDetonations`, `scanRadar` and `computeVisionSet` shouldn't take `Iterable<T>` arguments because using spread operator (`[...iterable]`) inside them causes $O(N)$ iterator allocations on every tick.
**Action:** Always fetch custom `.valuesArray()` from `EntityMap` instances which caches the resulting array, and pass `readonly T[]` arguments into these heavily-used methods. Convert nested `for...of` loops iterating over these arrays into index-based `for (let i = 0; i < len; i++)` loops to avoid iterator creation overhead.
