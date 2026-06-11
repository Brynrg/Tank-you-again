const { performance } = require('perf_hooks');

// Can we use a custom Map class that tracks its own array of values?
class TrackedMap extends Map {
  constructor() {
    super();
    this.cachedValues = [];
    this.isDirty = false;
  }
  set(key, value) {
    super.set(key, value);
    this.isDirty = true;
    return this;
  }
  delete(key) {
    const res = super.delete(key);
    if (res) this.isDirty = true;
    return res;
  }
  clear() {
    super.clear();
    this.isDirty = true;
  }
  get valuesArray() {
    if (this.isDirty) {
      this.cachedValues = Array.from(super.values());
      this.isDirty = false;
    }
    return this.cachedValues;
  }
}

const map = new TrackedMap();
for(let i=0; i<100; i++) map.set(i, {id: i});

function everyTickTrackedMap() {
  const start = performance.now();
  let count = 0;
  for(let tick=0; tick<60000; tick++) {
    const arr = map.valuesArray;
    for(let bot=0; bot<1; bot++) {
      for(const item of arr) {
        count += item.id;
      }
    }
  }
  return performance.now() - start;
}

console.log('TrackedMap:', everyTickTrackedMap());
