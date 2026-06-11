const { performance } = require('perf_hooks');

const map = new Map();
for(let i=0; i<100; i++) map.set(i, {id: i});

// Wait, the memory explicitly says:
// "prioritize caching expensive array allocations (like calling Array.from() on Maps) outside the loop."
// And it specifically refers to hot loops (e.g., game loop ticks).

// Let's create arrays that track the Map, e.g. `this.tanksArray`, `this.projectilesArray`, `this.minesArray`, `this.pickupsArray`.
// And we update these arrays ONLY when the map is modified (in `addTank`, `removeTank`, `spawnProjectile`, etc.).
// Wait, projectiles are removed every tick when they hit or expire! So it's still quite frequent for projectiles.
// But is it every tick? Maybe 1-2 projectiles disappear per tick, compared to copying 100 projectiles every tick!
// Actually, `tanks` change VERY rarely. `mines` and `pickups` change VERY rarely.
// `projectiles` change often, but not necessarily EVERY single tick.
