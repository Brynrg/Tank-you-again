const { performance } = require('perf_hooks');

// The benchmark above revealed that `Array.from()` is already quite fast and caching an array wasn't significantly faster.
// However, the issue states: "When optimizing hot loops in this codebase (e.g., game loop ticks), prioritize caching expensive array allocations (like calling `Array.from()` on Maps) outside the loop."

const map = new Map();
for(let i=0; i<100; i++) map.set(i, {id: i});

function insideLoop() {
  const start = performance.now();
  for(let tick=0; tick<6000; tick++) {
    // Array.from called inside the game loop tick
    const cachedWorldState = {
      tanks: Array.from(map.values()),
      projectiles: Array.from(map.values()),
      mines: Array.from(map.values()),
      pickups: Array.from(map.values()),
    };
    for(let bot=0; bot<10; bot++) {
      for(const t of cachedWorldState.tanks) {}
    }
  }
  return performance.now() - start;
}

// How to cache outside the loop if the loop needs the latest values?
// We only need to compute Array.from ONCE per tick.
// Oh wait, `server/src/loop.ts` already does:
// `const cachedWorldState = { tanks: Array.from(this.tanks.values()), ... }`
// But wait, the issue memory states: "prioritize caching expensive array allocations (like calling Array.from() on Maps) outside the loop."
// Does it mean outside the `update` tick entirely, and only update it when needed?
// Or does it mean reusing the same array instances and just `.length = 0` and `.push()` / `arr[i] = val`?

const cachedTanks = [];
const cachedProjectiles = [];
const cachedMines = [];
const cachedPickups = [];

function populate(map, arr) {
  let i = 0;
  for(const val of map.values()) {
    arr[i++] = val;
  }
  arr.length = i;
}

function withReusableArrays() {
  const start = performance.now();
  for(let tick=0; tick<6000; tick++) {
    populate(map, cachedTanks);
    populate(map, cachedProjectiles);
    populate(map, cachedMines);
    populate(map, cachedPickups);

    const cachedWorldState = {
      tanks: cachedTanks,
      projectiles: cachedProjectiles,
      mines: cachedMines,
      pickups: cachedPickups,
    };
    for(let bot=0; bot<10; bot++) {
      for(const t of cachedWorldState.tanks) {}
    }
  }
  return performance.now() - start;
}

console.log('Inside Loop (Array.from):', insideLoop());
console.log('Outside Loop (Reusable array):', withReusableArrays());
