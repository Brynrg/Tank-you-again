## 2026-06-16 - Array Allocation Overhead in Hot Loops

**Learning:** The game loop repeatedly allocates arrays of entities via `Array.from(map.values())` every tick for AI processing. This causes (N)$ allocations per bot per tick, leading to significant garbage collection pressure and memory thrashing. Micro-optimizations like 1D bounds checking yield less impact than eliminating these allocations.
**Action:** Replace standard `Map` collections with a custom `EntityMap` class that caches the array of values and updates it only when the map is mutated, using `.valuesArray()` in hot paths.
