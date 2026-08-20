## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-08-20 - Optimizing iterations over arrays in game loop

**Learning:** Passing `Iterable` to functions and using `for...of` loops spread over collections causes hidden internal allocations and iteration overhead in TypeScript that hurt hot loops.
**Action:** Replaced iterables with `readonly T[]` arrays and refactored `for...of` into bounds-safe `for (let i = 0; i < len; i++)` index loops to save CPU cycles.
