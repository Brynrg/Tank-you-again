## 2024-06-20 - Cache Entity Map Values

**Learning:** `Array.from(map.values())` inside the game tick loop causes large memory allocations and garbage collection thrashing when passing world state to AI bots, as it runs $O(\text{bots} \times \text{entities})$ times.
**Action:** Replace standard `Map` with a custom `EntityMap` that caches `.valuesArray()` to avoid array allocations when passing state to AI bots.
