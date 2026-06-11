const { performance } = require('perf_hooks');

// Wait, the prompt says "When optimizing hot loops in this codebase (e.g., game loop ticks), prioritize caching expensive array allocations (like calling Array.from() on Maps) outside the loop."
// Where is the loop?
// In `shared/sim/arena.ts:371` and `server/src/loop.ts:678`:
//
// ```
// if (this.aiEnemies.size > 0) {
//   const cachedWorldState = {
//     tanks: Array.from(this.tanks.values()), ...
//   };
//   for (const [aiId, ai] of this.aiEnemies) {
//     const action = ai.update(t, cachedWorldState); ...
//   }
// }
// ```
//
// So `Array.from` is already outside the inner `for (const [aiId, ai] of this.aiEnemies)` loop!
// Wait. Is it called EVERY game tick? Yes. `updateAIEnemies` is called every tick.
// Can we cache the arrays across ticks?
// We only need to rebuild `tanks` array if `tanks` Map changed?
// BUT it's an array of references, and the references are mutated. Yes! We don't need to create a new array if the Map hasn't changed.
// No, the Map `values()` might be the exact same objects, but wait, `Array.from` allocates a NEW array on every tick!
// If we cache it on the class instance, we avoid `Array.from` allocation completely.

const map = new Map();
for(let i=0; i<100; i++) map.set(i, {id: i});

function everyTickArrayFrom() {
  const start = performance.now();
  for(let tick=0; tick<60000; tick++) {
    const arr = Array.from(map.values());
    let sum = 0;
    for(const item of arr) sum += item.id;
  }
  return performance.now() - start;
}

const iteratorCache = map.values(); // wait, iterator depletes
let cachedArray = Array.from(map.values());
function cacheIfUnchanged() {
  const start = performance.now();
  for(let tick=0; tick<60000; tick++) {
    // assume map size hasn't changed
    const arr = cachedArray;
    let sum = 0;
    for(const item of arr) sum += item.id;
  }
  return performance.now() - start;
}

console.log('Every tick Array.from:', everyTickArrayFrom());
console.log('Use cached array:', cacheIfUnchanged());
