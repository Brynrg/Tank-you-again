## 2024-07-01 - Optimizing Map to Array conversions in game loop

**Learning:** `Array.from(map.values())` is called frequently in hot paths (like the game loop tick) resulting in excessive temporary allocations.
**Action:** Use a custom `EntityMap` implementation that caches the resulting array when the map contents change.

## 2024-07-01 - Avoid repeated .valuesArray() in hot loops\n**Learning:** When using custom `EntityMap.valuesArray()`, repeatedly calling it in the loop condition (`for(let i=0; i<this.tanks.valuesArray().length; i++)`) incurs unnecessary method call overhead.\n**Action:** Assign the returned array to a local variable before the loop (`const tanksArr = this.tanks.valuesArray(); for(let i=0; i<tanksArr.length; i++)`) to maximize hot path optimization.
