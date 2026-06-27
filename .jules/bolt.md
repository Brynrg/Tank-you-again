## 2024-07-16 - Optimizing array allocation hot loops in Game Loop

**Learning:** Found that `Array.from(Map.values())` was being called inside hot loops for every tick for the bots' AI simulation context arrays. This causes memory thrashing ($O(\text{bots} \times \text{entities})$).
**Action:** Replace `Map` usages in those structures with `EntityMap`, a custom class wrapping a `Map` that caches `.valuesArray()`. Ensure `EntityMap` correctly implements the `Map` interface when using `npm run typecheck`.
