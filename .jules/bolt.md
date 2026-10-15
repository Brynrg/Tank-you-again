## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2026-07-08 - Enforcing array inputs to avoid O(N) spreads in hot paths

**Learning:** When hot loop functions (like `stepMineDetonations` or `findHit`) accept `Iterable<T>`, it's tempting to use `[...iterable]` inside them to iterate multiple times. This causes an O(N) allocation on _every single game tick_.
**Action:** Enforce `readonly T[]` signatures for hot path functions and pass down cached arrays (like `EntityMap.valuesArray()`) directly.
