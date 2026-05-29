import { RoomLoop } from "./server/dist/index.js";

// Test AI functionality
console.log("Testing AI Enemies...");

const room = new RoomLoop();

// Add an AI enemy
console.log("Adding AI enemy...");
const ai = room.addAIEnemy("medium");
console.log("AI enemy created:", ai.getTank().name);
console.log("AI difficulty:", ai.getDifficulty());

// Get the tank to see the actual properties
const tank = ai.getTank();
console.log("Tank properties:", {
  id: tank.id,
  name: tank.name,
  team: tank.team,
  rank: tank.rank,
  x: tank.x,
  y: tank.y,
  fuel: tank.fuel,
  ammo: tank.ammo,
});

// Test that it's in the tanks map
console.log("Tanks in room:", room.getTanksForTesting().size);

// Get all tanks to see their teams
console.log("\nAll tanks:");
for (const [tankId, tank] of room.getTanksForTesting()) {
  console.log(`${tankId}: ${tank.name} (${tank.team}) team: ${tank.team}`);
}

// Run a few ticks to see if AI enemies spawn automatically
console.log("\nRunning 300 ticks...");
for (let i = 0; i < 300; i++) {
  room.forceTick();
}

console.log("\nFinal tank count:", room.getTanksForTesting().size);
console.log(
  "AI enemies count in AI map:",
  room.getAIEnemies ? room.getAIEnemies().size : "Not available",
);

// List all tanks after running
console.log("\nAll tanks after 300 ticks:");
for (const [tankId, tank] of room.getTanksForTesting()) {
  console.log(`${tankId}: ${tank.name} (${tank.team}) team: ${tank.team}`);
}

console.log("\nTest completed!");
