## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2026-08-06 - Optimizing array allocations in iterators

**Learning:** When passing maps to hot loop functions that expect Iterable<T>, using the internal spread operator (e.g. `[...iterable]`) or running `for...of` loops over `values()` triggers repeated O(N) array allocations.
**Action:** Always accept typed arrays (e.g. `readonly T[]`) instead of `Iterable<T>` in hot-path functions, use `valuesArray()` for `EntityMap` objects to benefit from cached array conversions, and prefer index-based `for` loops (`for (let i = 0; i < len; i++)`) over `for...of`.
