## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-09 - Avoid Iterators in Hot Loops

**Learning:** Iterables like Map.values() allocate new iterators on each call, and using spread operator internally (`[...iterable]`) inside frequent loops introduces additional N overhead.
**Action:** Replace `Iterable<T>` with `readonly T[]` in hot paths (like `findHit` and `stepMineDetonations`) and use custom `EntityMap.valuesArray()` to reuse cached arrays.
