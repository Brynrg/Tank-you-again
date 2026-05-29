import { RoomLoop } from "./server/dist/index.js";

// Test AI functionality
console.log("Testing AI Enemies...");

const room = new ServerModule.RoomLoop();

// Add an AI enemy
console.log("Adding AI enemy...");
const ai = room.addAIEnemy("medium");
console.log("AI enemy created:", ai.getTank().name);
console.log("AI difficulty:", ai.getDifficulty());

// Test that it's in the tanks map
console.log("Tanks in room:", room.getTanksForTesting().size);

// Run a few ticks to see if AI enemies spawn automatically
console.log("Running 200 ticks...");
for (let i = 0; i < 200; i++) {
  room.forceTick();
}

console.log("Final tank count:", room.getTanksForTesting().size);
console.log("AI enemies count:", room.getAIEnemiesForTesting().size);

// List all tanks
console.log("\nAll tanks:");
for (const [tankId, tank] of room.getTanksForTesting()) {
  console.log(`${tankId}: ${tank.name} (${tank.team})`);
}

console.log("\nTest completed!");
