## 2025-02-18 - Avoid repeated array allocations from map values in hot loops

**Learning:** Calling `Array.from(map.values())` on standard Javascript `Map` objects creates a new array every time it is called. When done in a hot loop like a game tick per player, this results in excessive memory allocation and garbage collection thrashing which drops server TPS.
**Action:** Use a custom map structure like `EntityMap` which extends `Map` and caches `.valuesArray()` array responses, invalidating the cache only upon map mutation (set/delete/clear).
