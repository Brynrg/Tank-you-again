const { performance } = require('perf_hooks');

const map = new Map();
for(let i=0; i<100; i++) map.set(i, {id: i});

function testArrayFrom() {
  let count = 0;
  for(let i=0; i<1000; i++) {
    const arr = Array.from(map.values());
    for(let bot=0; bot<10; bot++) {
      for(const item of arr) {
        count += item.id;
      }
    }
  }
  return count;
}

function testIterable() {
  let count = 0;
  for(let i=0; i<1000; i++) {
    const arr = map.values();
    for(let bot=0; bot<10; bot++) {
      // arr is depleted after first iteration, this is wrong logic for reusing.
      // We must get a new iterator each time for this to work.
    }
  }
  return count;
}

function testGetter() {
  let count = 0;
  for(let i=0; i<1000; i++) {
    const obj = {
      tanks: map.values() // this will be depleted
    };
  }
}

function testGetterCorrect() {
  let count = 0;
  for(let i=0; i<1000; i++) {
    const obj = {
      get tanks() { return map.values(); }
    };
    for(let bot=0; bot<10; bot++) {
      for(const item of obj.tanks) {
        count += item.id;
      }
    }
  }
  return count;
}

const start1 = performance.now();
testArrayFrom();
const end1 = performance.now();
console.log('Array.from (with reuse across bots):', end1 - start1);

const start2 = performance.now();
testGetterCorrect();
const end2 = performance.now();
console.log('Getter (iterator recreated per bot):', end2 - start2);
