const { performance } = require('perf_hooks');

const map = new Map();
for(let i=0; i<100; i++) map.set(i, {id: i});

// Wait, the memory states: "prioritize caching expensive array allocations (like calling Array.from() on Maps) outside the loop."
// It means: instead of doing `Array.from(this.tanks.values())` inside the game loop, cache it and ONLY update it when the map changes!
// Game loop runs at 60fps (tick loop). Most ticks, nothing changes. Projectiles change often, though.
// BUT `Array.from()` inside the game loop tick is the target.

let cachedArr = [];
let isDirty = true;

function markDirty() {
  isDirty = true;
}

function getCachedArr() {
  if (isDirty) {
    cachedArr = Array.from(map.values());
    isDirty = false;
  }
  return cachedArr;
}

function tickWithDirtyTracking() {
  const start = performance.now();
  let count = 0;
  for(let tick=0; tick<60000; tick++) {
    // Only 10% of ticks have changes
    if (tick % 10 === 0) markDirty();

    const arr = getCachedArr();
    for(let bot=0; bot<1; bot++) {
      for(const item of arr) {
        count += item.id;
      }
    }
  }
  return performance.now() - start;
}

function tickWithArrayFrom() {
  const start = performance.now();
  let count = 0;
  for(let tick=0; tick<60000; tick++) {
    const arr = Array.from(map.values());
    for(let bot=0; bot<1; bot++) {
      for(const item of arr) {
        count += item.id;
      }
    }
  }
  return performance.now() - start;
}

console.log('Dirty Tracking:', tickWithDirtyTracking());
console.log('Array.from:', tickWithArrayFrom());
