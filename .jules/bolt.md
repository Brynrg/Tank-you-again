## 2024-06-14 - Optimize game loop array allocations

**Learning:** In hot game loops (like Arena and RoomLoop `step`/`tick`), repeated `Array.from(map.values())` calls are a significant performance bottleneck due to $O(N)$ memory allocations causing garbage collection thrashing.
**Action:** Use the custom `EntityMap` class which extends standard `Map` to cache the values array. Call `entityMap.valuesArray()` instead of `Array.from(map.values())`. Ensure the cache is correctly invalidated on `set`, `delete`, and `clear` operations.
