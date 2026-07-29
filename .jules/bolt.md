## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.
## 2026-07-29 - Array.from hot path allocation

**Learning:** `Array.from(map.values())` inside the hot tick loop causes high object allocation overhead which affects performance. Replacing it with cached output of an `EntityMap` class decreases overhead greatly.
**Action:** Always favor cached values arrays rather than iterators in `requestAnimation` loops and network tick handlers.
