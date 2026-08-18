## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-02 - Array iteration optimizations

**Learning:** `for...of` loops over Iterables are common but create temporary iterator objects. Furthermore, many loops internally unpack Iterables into arrays via `[...iterable]`, which allocates completely new arrays on each loop iteration.
**Action:** When working with `EntityMap`, change parameter types from `Iterable<T>` to `readonly T[]` and pass `map.valuesArray()` instead of `map.values()`. Then use index-based `for (let i = 0; i < arr.length; i++)` loops. Update signatures in hot loop functions like `findHit`, `stepMineDetonations`, `computeVisionSet`, and `scanRadar` to accept readonly arrays.
