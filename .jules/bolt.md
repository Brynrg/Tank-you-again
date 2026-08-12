## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-02 - Array.from iterator allocation vs map values

**Learning:** Returning `Map.values()` yields an `IterableIterator` which causes temporary allocations when iterated over inside hot-path methods using `for...of` or `Array.from()`.
**Action:** Replace `Map.values()` with a pre-cached array via `.valuesArray()` in `EntityMap` when passing values to shared loop functions, and optimize nested loops to standard index-based `for` loops rather than `for...of`.
