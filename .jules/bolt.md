## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-02 - Array iteration optimizations in hot paths

**Learning:** Using `for...of` loops and passing `Iterable<T>` causes implicit iterator allocations in hot paths like the game loop ticks.
**Action:** Use `readonly T[]` for arguments, fetch arrays from `EntityMap.valuesArray()`, and iterate via index-based `for` loops (`for (let i = 0; i < arr.length; i++)`) to prevent repeated (N)$ allocations and maximize performance.
