import { Arena } from "./shared/sim/arena.js";

const arena = new Arena();
// Add 100 bots
for (let i = 0; i < 100; i++) {
  arena.addAIEnemy(1);
}

const start = performance.now();
for (let i = 0; i < 1000; i++) {
  arena.step(16);
}
const end = performance.now();

console.log(`1000 ticks took ${end - start} ms`);
