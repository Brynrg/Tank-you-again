## 2024-06-08 - Avoid O(N) array allocation inside AI update loops

**Learning:** The game loop processes AI updates for multiple AI enemies each tick. Inside this loop, calling `Array.from()` on large collections like tanks, projectiles, mines, and pickups causes repeated O(N) allocations for every AI enemy, putting pressure on garbage collection and slowing down the game loop.
**Action:** Pre-calculate arrays of these collections once per tick outside the AI update loop, and pass the same pre-calculated arrays to all AI enemies during that tick.
