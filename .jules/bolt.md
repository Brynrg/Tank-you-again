## 2025-02-27 - EntityMap for O(N) allocation optimization

**Learning:** Using `Array.from(map.values())` inside a hot game loop (like `Arena.updateAIEnemies` or `RoomLoop.updateAIEnemies` running 60 times a second) causes high garbage collection overhead and memory thrashing.
**Action:** Use a custom `EntityMap` that wraps the native Map and caches `.valuesArray()` upon mutation, avoiding repeated $O(N)$ allocations. Prioritize this pattern over repeated `Array.from` conversions in tick methods.
