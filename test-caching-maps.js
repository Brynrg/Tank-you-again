const { performance } = require('perf_hooks');

const map = new Map();
for(let i=0; i<100; i++) map.set(i, {id: i});

let cachedArray = [];
let cacheValid = false;

function markDirty() {
  cacheValid = false;
}

function getArray() {
  if (!cacheValid) {
    cachedArray = Array.from(map.values());
    cacheValid = true;
  }
  return cachedArray;
}

function everyTickSmartCache() {
  const start = performance.now();
  let count = 0;
  for(let tick=0; tick<60000; tick++) {
    const arr = getArray();
    for(let bot=0; bot<1; bot++) {
      for(const item of arr) {
        count += item.id;
      }
    }
  }
  return performance.now() - start;
}

function everyTickArrayFrom() {
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

console.log('Smart Cache:', everyTickSmartCache());
console.log('Array.from:', everyTickArrayFrom());
