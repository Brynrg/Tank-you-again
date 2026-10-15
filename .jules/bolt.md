## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2026-06-03 - Avoid array spreading Iterables in the game loop tick

**Learning:** `stepMineDetonations` was taking an `Iterable` and executing `[...tanks]` per tick, and `findHit` was iterating over `Iterable` allocating iterator objects per tick.
**Action:** Always accept `readonly TankState[]` directly in inner loop functions like combat hit tests and mine detonators, and pass `EntityMap.valuesArray()` from the caller.
