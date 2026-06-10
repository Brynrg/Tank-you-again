## 2023-10-24 - Cache Expensive Array Allocations Outside Game Loops

**Learning:** Calling `Array.from()` repeatedly inside tight game loops (e.g., iterating over each AI enemy to pass state) incurs heavy O(N) allocation overhead per bot.
**Action:** When iterating over entities to pass identical environment state, allocate necessary arrays or transform the state exactly once outside the loop and reuse the cached reference.
