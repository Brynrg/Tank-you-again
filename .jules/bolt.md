## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.
## 2024-07-31 - Eliminating Iterable<T> and spread overhead in hot loops
**Learning:** Functions accepting `Iterable<T>` (like `findHit`, `stepMineDetonations`, `computeVisionSet`, `scanRadar`) introduce hidden overhead. When these are called in hot paths using `map.values()` and `[...iterable]`, they cause excessive $O(N)$ allocations per game tick.
**Action:** Always type hot-path arrays as `readonly T[]` and utilize the custom `EntityMap.valuesArray()` to pass cached arrays instead of allocating iterators or doing spread operations. Also rewrite nested `for...of` loops iterating over array collections into optimized `for(let i=0; i<length; i++)` to further eliminate iterator allocations.
