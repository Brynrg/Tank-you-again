## 2026-06-22 - Cache Map Values Array
**Learning:** In hot game loops, repeatedly calling `Array.from(map.values())` or iterating over `map.values()` causes memory thrashing and GC pauses due to O(N) array allocation and iterator creation.
**Action:** Created `EntityMap` that extends `Map` to cache the values array. Call `valuesArray()` instead of `Array.from` when the map values need to be iterated or passed as an array. Clear the cache on `set`, `delete`, and `clear`.
