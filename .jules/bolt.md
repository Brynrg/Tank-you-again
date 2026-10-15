## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-02 - Optimizing array iteration in hot paths

**Learning:** Iterating over `Iterable<T>` using `for...of` loops allocates iterators and is slower than standard index-based `for` loops on arrays. Additionally, using the spread operator (`[...iterable]`) inside functions like `stepMineDetonations` causes unnecessary allocations.
**Action:** When optimizing hot loops, change parameter types from `Iterable<T>` to `readonly T[]` and use `for (let i = 0; i < arr.length; i++)` with non-null assertions (`arr[i]!`) instead of `for...of` to eliminate iterator allocations and spread operations. Pass `.valuesArray()` from the `EntityMap` when calling these functions.
