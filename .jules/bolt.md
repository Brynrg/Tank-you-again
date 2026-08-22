## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-02 - Eliminate Iterator Allocations in Hot Array Loops

**Learning:** `for...of` loops over collections and spread operator usages (`[...iterable]`) generate hidden temporary array allocations that become problematic in high-frequency server game loops (like collision detection or entity iteration).
**Action:** When updating or modifying iterations over collections, prefer utilizing `.valuesArray()` on custom `EntityMap` structures, combined with standard index-based `for (let i = 0; i < length; i++)` loops to completely eliminate iterator and array allocations in hot paths.
