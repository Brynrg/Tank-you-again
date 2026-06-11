const { performance } = require('perf_hooks');

const map = new Map();
for(let i=0; i<100; i++) map.set(i, {id: i});

// Does it really help to use an iterator multiple times?
function testGetterCorrect() {
  const start = performance.now();
  let count = 0;
  for(let tick=0; tick<60000; tick++) {
    const obj = {
      get tanks() { return map.values(); }
    };
    for(let bot=0; bot<1; bot++) { // just 1 bot for comparison with 1 array.from
      for(const item of obj.tanks) {
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

console.log('Getter (iterator):', testGetterCorrect());
console.log('Every tick Array.from:', everyTickArrayFrom());
