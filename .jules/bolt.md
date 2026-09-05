## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-02 - Replacing Iterable loops with cached array indexed loops in hot paths

**Learning:** Iterating over `Iterable<T>` properties using `for...of` loops, or using the spread operator (`[...iterable]`), especially in high-frequency functions like `stepMineDetonations`, `computeVisionSet`, or `findHit`, causes noticeable allocation overhead and performance degradation during hot loop execution.
**Action:** Always prefer accepting `readonly T[]` in inner simulation functions instead of `Iterable<T>`. When iterating through collections managed by `EntityMap` inside the game loop or arena, use the cached `.valuesArray()` property rather than allocating new iterators via `.values()`. Ensure these cached arrays are iterated over using an index-based loop `for (let i = 0; i < arr.length; i++)` instead of `for...of` to further minimize allocation.
