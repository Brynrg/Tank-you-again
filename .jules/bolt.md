## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-08-14 - Optimizing Hot Loops and Iterable Traversals

**Learning:** Avoid `for...of` loops and spread syntax `[...iterable]` on iterables in hot-paths (e.g., game loop ticks). They trigger internal iterator allocations which cause measurable garbage collection overhead when executed constantly.
**Action:** Use cached arrays like `.valuesArray()` on the custom `EntityMap` structure. Update hot-path functions to accept typed arrays (e.g., `readonly TankState[]`) instead of `Iterable`, and use index-based `for` loops (`for (let i = 0; i < arr.length; i++)`) with the non-null assertion `arr[i]!` to completely eliminate iterator allocations.
