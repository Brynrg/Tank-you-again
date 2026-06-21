## 2025-02-10 - Cached Array Allocations in Game Loops

**Learning:** Hot game loops (like updating AI bots each tick) can suffer significant performance degradation and memory thrashing from repeated $O(N)$ allocations (e.g., `Array.from(map.values())`). This codebase is particularly susceptible when the bot count multiplied by total game entities grows large.
**Action:** Use the custom `EntityMap` implementation (`shared/sim/entity-map.ts`) which extends the native Map to internally track mutations and lazily regenerate an internal array cache via `.valuesArray()`. Always prioritize avoiding redundant allocations per tick over micro-optimizations like bounding box checks.
