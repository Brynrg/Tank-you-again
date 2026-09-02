## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-09-02 - Array iteration allocation optimization

**Learning:** Using `Iterable<T>` in hot loops across the game simulation and vision systems was incurring hidden allocation overhead due to the spread operator `[...iterable]` and new iterators when doing `for (const x of iterable)`.
**Action:** Always accept typed arrays `readonly T[]` in high-frequency path functions (`findHit`, `stepMineDetonations`, `computeVisionSet`) and utilize index-based loops `for (let i = 0; i < length; i++)` combined with `EntityMap.valuesArray()` when parsing large state maps to completely avoid iterator allocations.
