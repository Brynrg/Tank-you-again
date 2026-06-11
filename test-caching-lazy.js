const { performance } = require('perf_hooks');

const map = new Map();
for(let i=0; i<100; i++) map.set(i, {id: i});

// What if we don't invalidate on EVERY map change, but rather just update the array when requested IF the map size changed?
// Wait, map size changing doesn't cover elements being replaced without size change (which we don't do, we use `set` and `delete`).
// Actually, `Array.from` is slow because of allocation.
// What if we just pre-allocate a big array and reuse it?

let bigArray = new Array(1000);
function updateArray() {
  let i = 0;
  for(const v of map.values()) {
    bigArray[i++] = v;
  }
  bigArray.length = i; // this is cheap
}

function everyTickBigArray() {
  const start = performance.now();
  let count = 0;
  for(let tick=0; tick<60000; tick++) {
    updateArray();
    for(let bot=0; bot<1; bot++) {
      for(const item of bigArray) {
        count += item.id;
      }
    }
  }
  return performance.now() - start;
}

console.log('Every tick big array:', everyTickBigArray());
