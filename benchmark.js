const { performance } = require('perf_hooks');

const map = new Map();
for(let i=0; i<100; i++) map.set(i, {id: i});

function testArrayFrom() {
  let count = 0;
  for(let i=0; i<10000; i++) {
    const arr = Array.from(map.values());
    for(let j=0; j<5; j++) {
      for(const item of arr) {
        count += item.id;
      }
    }
  }
  return count;
}

function testGetter() {
  let count = 0;
  for(let i=0; i<10000; i++) {
    const obj = {
      get tanks() { return map.values(); }
    };
    for(let j=0; j<5; j++) {
      for(const item of obj.tanks) {
        count += item.id;
      }
    }
  }
  return count;
}

function testCachedObject() {
  let count = 0;
  const obj = {
    get tanks() { return map.values(); }
  };
  for(let i=0; i<10000; i++) {
    for(let j=0; j<5; j++) {
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
console.log('Array.from:', end1 - start1);

const start2 = performance.now();
testGetter();
const end2 = performance.now();
console.log('Getter:', end2 - start2);

const start3 = performance.now();
testCachedObject();
const end3 = performance.now();
console.log('Cached object getter:', end3 - start3);
