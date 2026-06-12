## 2024-06-12 - Cache expensive array allocations in game loop

**Learning:** Frequent `Array.from()` calls inside the game loop or bot update routines (which runs at 60Hz and can have many entities/bots) cause significant memory thrashing ($O(\text{bots} \times \text{entities})$ allocations).
**Action:** Use the custom `EntityMap` class (located in `shared/sim/entity-map.ts`) which extends `Map` and caches `.valuesArray()` upon mutation. This prevents repeated array creation and reduces the garbage collection overhead significantly.
