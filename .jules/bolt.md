## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-08-02 - Array iterations in hot loop via spreading iterables

**Learning:** Using `Iterable<T>` as parameter types in hot-path loops (like simulation step functions) often hides $O(N)$ allocations because developers tend to spread them using `[...iterable]` or `for...of` constructs.
**Action:** Always accept `readonly T[]` for lists that we know are backed by `EntityMap` values when optimizing hot loops, and rewrite the iteration to use standard index-based `for(let i = 0; ...)` loops to prevent Iterator allocations.
