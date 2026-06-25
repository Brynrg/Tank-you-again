## 2025-06-25 - EntityMap Allocation Caching

**Learning:** Hot loops in the game server (`RoomLoop` and `Arena`) were incurring severe memory allocation penalties by repeatedly calling `Array.from(this.tanks.values())` and similar on standard JavaScript `Map`s per tick per AI bot. Standard `Map`s don't cache array manifestations, turning $O(1)$ operations into repeated $O(N)$ memory thrashing.
**Action:** Implemented an `EntityMap` wrapper that subclasses/wraps `Map` and caches a `.valuesArray()` that is only invalidated upon `set`, `delete`, or `clear`. Use this pattern for any hot-loop collection that requires array semantics but mutates infrequently compared to read operations.
