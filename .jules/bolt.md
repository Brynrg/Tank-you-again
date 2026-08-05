## 2024-08-05 - Avoid .values() on EntityMap hot loops

**Learning:** `EntityMap` provides a `valuesArray()` method which caches the underlying Map's `.values()` as an array, avoiding an O(N) allocation of the map iterator each tick. `server/src/loop.ts` and `shared/sim/arena.ts` hot loops should use this when scanning for hit tests or visions.
**Action:** Always prefer `valuesArray()` when iterating over `EntityMap` values in frequent operations.
