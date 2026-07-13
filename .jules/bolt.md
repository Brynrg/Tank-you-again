## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.
## 2024-07-13 - Replacing .values() with .valuesArray() in hot loops

**Learning:** Iterating over `EntityMap.values()` allocates an `IterableIterator` on every call. Converting functions in `combat.ts`, `mines.ts` and `vision.ts` to accept `readonly T[]` instead of `Iterable<T>` allows callers to pass the `EntityMap.valuesArray()` cached array, drastically reducing allocation frequency in hot game tick paths.
**Action:** When a custom collection offers a cached array (like `EntityMap.valuesArray()`), ensure hot-path functions accept the array type and avoid internal spreads.
