## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-11-20 - Array copies and spread operator in hot loops

**Learning:** Iterables provided to nested hot loops (like `[...tanks]` spread within `stepMineDetonations` and similar logic over `Iterable`) trigger full unoptimized $O(N)$ allocation on every invocation inside tick logic.
**Action:** Always accept `readonly T[]` and utilize `valuesArray()` from the entity-map cache to pass a strict pre-allocated Array reference rather than spreading or converting iterables down the line.
