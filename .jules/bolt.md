## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2026-08-17 - Optimizing Array iterators in hot paths

**Learning:** `for...of` loops and spread array copies allocating iterators and arrays inside high-frequency server game loops (like `tick()`) create excessive memory allocations that cause garbage collection pauses.
**Action:** Replace iterables in hot-path signatures with `readonly T[]`, map `for...of` to indexed `for (let i = 0; i < length; i++)` loops, and use `EntityMap.valuesArray()` cache instead of standard `.values()`.
