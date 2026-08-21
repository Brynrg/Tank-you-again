## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2026-08-21 - Avoiding iterator allocations in hot loops

**Learning:** Iterating over iterables (like those returned by map.values()) and copying them into arrays (e.g. [...tanks]) in hot paths like the simulation tick allocates new iterator objects constantly.
**Action:** Use 'readonly T[]' rather than 'Iterable<T>' for hot-path function signatures, pass EntityMap.valuesArray() instead of EntityMap.values(), and use index-based loops 'for (let i = 0; i < arr.length; i++)' instead of 'for...of' to completely eliminate intermediate iterator allocations.
