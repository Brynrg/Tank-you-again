## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-11-20 - Using typed arrays instead of Iterable in hot loops

**Learning:** Passing iterables like `this.tanks.values()` into functions that iterate over them multiple times forces array allocation (e.g. `[...tanks]`) inside the function, hiding the cost.
**Action:** Change the signatures of hot-path functions to accept typed arrays directly (e.g. `readonly TankState[]`) and pass `this.tanks.valuesArray()` from `EntityMap` to avoid repeated O(N) allocations in `findHit`, `stepMineDetonations`, and `computeVisionSet`.
