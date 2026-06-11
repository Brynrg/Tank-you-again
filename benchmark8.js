const { performance } = require('perf_hooks');

// Wait! We can track a version/revision number for the Map!
// But Map doesn't have a built-in version number.
// Since we only add/remove from the maps in specific methods (e.g., spawnTank, removeTank),
// we could maintain the arrays in those methods!

// Example:
class GameState {
  constructor() {
    this.tanks = new Map();
    this.tanksArray = [];
  }

  addTank(id, tank) {
    this.tanks.set(id, tank);
    this.tanksArray = Array.from(this.tanks.values()); // Only update on add/remove!
  }

  removeTank(id) {
    this.tanks.delete(id);
    this.tanksArray = Array.from(this.tanks.values()); // Only update on add/remove!
  }
}

const state = new GameState();
for(let i=0; i<100; i++) state.addTank(i, {id: i});

function cacheOnModification() {
  const start = performance.now();
  for(let tick=0; tick<60000; tick++) {
    // Array is already ready!
    const arr = state.tanksArray;
    let sum = 0;
    for(const item of arr) sum += item.id;
  }
  return performance.now() - start;
}

function everyTickArrayFrom() {
  const start = performance.now();
  for(let tick=0; tick<60000; tick++) {
    const arr = Array.from(state.tanks.values());
    let sum = 0;
    for(const item of arr) sum += item.id;
  }
  return performance.now() - start;
}

console.log('Cache on modification:', cacheOnModification());
console.log('Every tick Array.from:', everyTickArrayFrom());
