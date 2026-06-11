const { performance } = require('perf_hooks');

// Let's test just reusing a pre-allocated array and updating it.
const map = new Map();
for(let i=0; i<100; i++) map.set(i, {id: i});

const cachedArr = [];

function updateCachedArray() {
  let i = 0;
  for(const v of map.values()) {
    cachedArr[i++] = v;
  }
  cachedArr.length = i;
}

function everyTickReusableArray() {
  const start = performance.now();
  for(let tick=0; tick<60000; tick++) {
    // update it every tick
    updateCachedArray();
    let sum = 0;
    for(const item of cachedArr) sum += item.id;
  }
  return performance.now() - start;
}

function everyTickArrayFrom() {
  const start = performance.now();
  for(let tick=0; tick<60000; tick++) {
    const arr = Array.from(map.values());
    let sum = 0;
    for(const item of arr) sum += item.id;
  }
  return performance.now() - start;
}

console.log('Every tick Array.from:', everyTickArrayFrom());
console.log('Every tick Reusable Array:', everyTickReusableArray());
