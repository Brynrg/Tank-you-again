1. **Optimize `server/src/loop.ts`**
   - In `updateAIEnemies`, `Array.from` is called on Maps for `tanks`, `projectiles`, `mines`, and `pickups` inside the loop for every single bot.
   - Move these allocations to the top of `updateAIEnemies` so they are only allocated once per tick, not `N` times per tick.

2. **Optimize `shared/sim/arena.ts`**
   - Similarly, in `updateAIEnemies`, move the `Array.from` calls on Maps for `tanks`, `projectiles`, `mines`, and `pickups` outside of the bot loop.

3. **Optimize `shared/sim/ai-perception.ts`**
   - The world state passed into `ai.update` (and eventually `sense`) now contains arrays instead of iterables/Maps because we converted them. We must update the type cast to avoid redundant `Array.from` calls, or simply use them as arrays directly.

4. **Verify the Optimization**
   - Run `npm test` and `npm run typecheck` to ensure no broken functionality or typings.

5. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
   - Run `pre_commit_instructions` and follow them.

6. **Submit PR**
   - Use `submit` to create PR with the title '⚡ Bolt: Optimize AI update array allocations' and include the required performance sections in the description.
