## 2026-06-29 - Array.from allocations in Game Loop

**Learning:** Found that `Array.from(map.values())` inside the tight update loops (e.g. updating AI state in `arena.ts`) runs continuously, creating excessive temporary arrays and heavily contributing to garbage collection latency.
**Action:** Introduced a custom `EntityMap` class that caches the values array upon mutation. Use this instead of standard Maps for core game loop entities to avoid hot loop garbage collection triggers.
