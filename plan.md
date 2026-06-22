1. **Implement `EntityMap`**
   - I will create `shared/sim/entity-map.ts` which extends `Map` and caches `Array.from(this.values())` when calling a new method `valuesArray()`. The cache is cleared on `set`, `delete`, and `clear`.
2. **Use `EntityMap` in `shared/sim/arena.ts`**
   - I'll replace `this.tanks`, `this.projectiles`, `this.mines`, and `this.pickups` with `EntityMap`.
   - Update usages of `this.tanks.values()` to `this.tanks.valuesArray()` when an array or iterable is expected (e.g. `Array.from(this.tanks.values())` becomes `this.tanks.valuesArray()`).
3. **Use `EntityMap` in `server/src/loop.ts`**
   - Similar to Arena, I'll update the server loop maps to use `EntityMap` and replace `.values()` with `.valuesArray()`.
4. **Update `shared/sim/ai-decision.ts` (if necessary)**
   - Check if other files need to be updated due to type changes or missing `.valuesArray()` on generic maps. Wait, `.valuesArray()` returns an array which is iterable, so it should be compatible anywhere `IterableIterator` was used, but it's faster.
5. **Pre-commit Steps**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
6. **Submit PR**
