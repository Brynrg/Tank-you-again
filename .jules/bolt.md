## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-02 - Array iterations in hot loops

**Learning:** `for...of` loops internally allocate iterators, and using `[...iterable]` spreads allocate entirely new arrays. In extremely hot loops (like game loop ticks executing at 60Hz), these repeated allocations trigger GC thrashing.
**Action:** When iterating over collections in hot paths, explicitly pass `readonly T[]` instead of `Iterable<T>`, use `EntityMap.valuesArray()` to retrieve cached arrays, and rewrite `for...of` loops into index-based `for (let i = 0; i < length; i++)` loops.
