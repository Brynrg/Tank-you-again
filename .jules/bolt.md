## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-02 - Eliminate Iterator Allocations in Hot Paths

**Learning:** Iterables and `for...of` loops create implicit iterator objects which cause GC pressure in hot loops (like game loop ticks). Passing iterables to functions that use spreads (e.g. `[...tanks]`) makes it worse.
**Action:** Use typed arrays in hot-path function signatures. Consume `EntityMap.valuesArray()` at the exact moment the data is needed, and iterate using index-based `for` loops (`for (let i = 0; i < arr.length; i++)`).
