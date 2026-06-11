const { performance } = require('perf_hooks');

// Let's benchmark using an iterator that yields arrays but we keep the arrays around instead of allocating a new one every tick.
const map = new Map();
for(let i=0; i<100; i++) map.set(i, {id: i});

const cachedArray = new Array(100);

function populateCachedArray() {
  let i = 0;
  for(const val of map.values()) {
    cachedArray[i++] = val;
  }
  cachedArray.length = i; // trim if smaller
}

function withReusableArray() {
  const start = performance.now();
  for(let tick=0; tick<6000; tick++) {
    populateCachedArray();
    const cachedWorldState = {
      tanks: cachedArray,
    };
    for(let bot=0; bot<10; bot++) {
      for(const t of cachedWorldState.tanks) {}
    }
  }
  return performance.now() - start;
}

function withArrayFrom() {
  const start = performance.now();
  for(let tick=0; tick<6000; tick++) {
    const cachedWorldState = {
      tanks: Array.from(map.values()),
    };
    for(let bot=0; bot<10; bot++) {
      for(const t of cachedWorldState.tanks) {}
    }
  }
  return performance.now() - start;
}

console.log('Reusable array:', withReusableArray());
console.log('Array.from:', withArrayFrom());
