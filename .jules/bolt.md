## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2026-07-22 - Optimize Map to Array allocations in game loop

**Learning:** `.values()` on standard or Entity maps still creates iterables, resulting in slow inner-loop allocations when passed to functions iterating via `for...of` or array spread.
**Action:** Replaced map `.values()` iteration in hot paths like the game loop tick and vision calculations with `EntityMap.valuesArray()` to utilize cached array instances, reducing GC pressure and eliminating O(N) array allocation overhead.
