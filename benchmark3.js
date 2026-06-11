const { performance } = require('perf_hooks');

// Let's benchmark the specific pattern used in perception.js
const map = new Map();
for(let i=0; i<500; i++) map.set(i, {id: i});

function withArrayFrom() {
  const start = performance.now();
  for(let tick=0; tick<600; tick++) { // 10 seconds at 60fps
    // Game loop ticks
    const cachedWorldState = {
      tanks: Array.from(map.values()),
      projectiles: Array.from(map.values()),
      mines: Array.from(map.values()),
      pickups: Array.from(map.values()),
    };

    // 10 bots per tick
    for(let bot=0; bot<10; bot++) {
      // simulate perception
      for(const t of cachedWorldState.tanks) {}
      for(const p of cachedWorldState.projectiles) {}
      for(const m of cachedWorldState.mines) {}
      for(const pk of cachedWorldState.pickups) {}
    }
  }
  return performance.now() - start;
}

function withGetters() {
  const start = performance.now();
  for(let tick=0; tick<600; tick++) { // 10 seconds at 60fps
    // Game loop ticks
    const cachedWorldState = {
      get tanks() { return map.values(); },
      get projectiles() { return map.values(); },
      get mines() { return map.values(); },
      get pickups() { return map.values(); },
    };

    // 10 bots per tick
    for(let bot=0; bot<10; bot++) {
      // simulate perception
      for(const t of cachedWorldState.tanks) {}
      for(const p of cachedWorldState.projectiles) {}
      for(const m of cachedWorldState.mines) {}
      for(const pk of cachedWorldState.pickups) {}
    }
  }
  return performance.now() - start;
}

function withArraysDirectly() {
  const start = performance.now();
  // Instead of maps, if the game used arrays for these collections:
  // (We can't easily change the architecture, but let's see how much we lose from Maps)
  const arr = Array.from(map.values());
  for(let tick=0; tick<600; tick++) {
    const cachedWorldState = {
      tanks: arr,
      projectiles: arr,
      mines: arr,
      pickups: arr,
    };

    // 10 bots per tick
    for(let bot=0; bot<10; bot++) {
      // simulate perception
      for(const t of cachedWorldState.tanks) {}
      for(const p of cachedWorldState.projectiles) {}
      for(const m of cachedWorldState.mines) {}
      for(const pk of cachedWorldState.pickups) {}
    }
  }
  return performance.now() - start;
}

function withCache() {
  const start = performance.now();
  let cachedArrays = null;
  let lastTick = -1;

  for(let tick=0; tick<600; tick++) {
    // Only rebuild arrays if they actually changed?
    // In game loop, they might change frequently, but let's just see.
  }
}

console.log('Array.from (current cache approach):', withArrayFrom());
console.log('Getters (iterating Maps multiple times):', withGetters());
console.log('Using arrays directly (baseline):', withArraysDirectly());
