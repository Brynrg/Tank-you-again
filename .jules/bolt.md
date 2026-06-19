## 2024-06-18 - Avoid repeated Array.from() allocations on Maps

**Learning:** `Array.from()` inside a game loop tick (especially for large map collections) causes O(bots \* entities) memory thrashing and unnecessary GC pauses.
**Action:** Use the custom `EntityMap` class (e.g. `shared/sim/entity-map.ts`) which caches `.valuesArray()` upon mutation to replace `Map` for state structures like tanks, projectiles, mines, and pickups that need frequent iteration in array form.
