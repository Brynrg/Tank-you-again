## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-02 - Replacing Iterators with Arrays in Hot Loops

**Learning:** `EntityMap` provides a `.valuesArray()` method which caches its resulting array, making it ideal for high-frequency game loops where we previously iterated over standard iterators and allocated new ones. In standard maps, trying to call `.valuesArray()` throws an error, so only call it on explicit `EntityMap` instances, and use `readonly T[]` arrays in downstream functions like `findHit` instead of `Iterable<T>` to avoid internal array spreads (e.g., `[...tanks]`).
**Action:** Replace `Map.values()` iterators with `.valuesArray()` on `EntityMap` structures and refactor nested loops to be index-based instead of using `for...of` in hot paths.
