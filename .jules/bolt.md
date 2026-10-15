## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-02 - EntityMap Array Caching

**Learning:** When dealing with maps that are updated and then frequently iterated over, converting `map.values()` to an array in the hot loop using `Array.from()` or `[...map.values()]` incurs significant performance penalties due to temporary array and iterator allocations.
**Action:** When you are sure an object is an `EntityMap` rather than a standard `Map`, use `.valuesArray()` instead of `.values()` when providing iterables to hot path methods like `findHit` and `stepMineDetonations`, or when looping over entities in tick functions. This uses the cached array which avoids these frequent reallocations.
