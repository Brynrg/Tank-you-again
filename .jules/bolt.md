## 2025-02-12 - Caching Array Allocations in Game Loops

**Learning:** Hot loops in `RoomLoop` and `Arena` (e.g. `updateAIEnemies` or AI logic itself) were calling `Array.from(this.tanks.values())` repeatedly. In a multiplayer sim or AI update tick running ~60 times a second, repeated (N)$ allocations to convert Maps into Arrays are a significant and measurable performance bottleneck, especially for larger player/bot counts.
**Action:** Instead of allocating new arrays every tick or for every bot in `updateAIEnemies` and `snapshotFor`, we should cache these array values per-tick or maintain them alongside the Maps to avoid allocating them deep in the hot path. I will replace the repetitive `Array.from(this.tanks.values())` calls with arrays built once per tick.
