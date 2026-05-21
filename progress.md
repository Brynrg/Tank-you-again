Original prompt: check my speedrungames repo on github, lets improve my tank you again game. It is meant to be the battlefield circa 2006 tank game but with a modern skin. I need the game play to be as close to original as possible. DO the research on the game/gameplay read the repo and build an upgrade plan to improve tank you again to Battlefield level.

## 2026-05-21

- Researched the intended reference as Bonus.com/playbattlefield.com Battlefield, represented by TankPit, not the EA/DICE Battlefield FPS series.
- Added `BATTLEFIELD_FIDELITY_UPGRADE_PLAN.md` with a phase plan anchored to command movement, fuel/equipment/radar economy, classic maps, progression, reconnect behavior, tournaments, and modern visual skin.
- Current execution slice: implement Phase 1 foundation, command-based click-to-move, while keeping the existing authoritative server loop and legacy `INPUT` path functional for tests/backward compatibility.
- Implemented initial command protocol (`MOVE_TO`, `STOP`), server command state, click-to-move client controls, command marker rendering, and room-loop tests for moving/stopping commands.
- Browser playtest initially exposed a Chrome pattern-regex issue in `client/src/auth-screen.ts`; escaped the hyphen so the auth overlay no longer emits a console error.
- Added Playwright as a dev dependency and installed the Chromium runtime so the `develop-web-game` Playwright client can run for future UI tests.
- Verified command movement in the browser with `DISABLE_DB=1 npm run dev`; snapshots stayed open, tank coordinates changed over iterations, and the screenshot showed the command marker plus local tank.
- Continued Phase 2 with active radar: `R` spends fuel, radar reveals nearby hidden pickups and enemy mines per viewer, distant pickups are hidden unless close or scanned, and passive global mine sweeps were removed.
- Added tests for hidden distant pickups, enemy mine masking, active radar reveal, and radar fuel cost.
- Browser verification: the required web-game client still reaches gameplay cleanly; a targeted Playwright keypress check confirmed `R` reduced fuel from 1000 to 965 with no console/page errors.
- Continued equipment fidelity: tanks now track shield and radar equipment counts; shield activation consumes one shield unit, radar scan consumes one radar unit plus fuel, and shield/radar pickups replenish counts.
- Fixed stale shooting aim by attaching the current cursor angle directly to bullet and missile fire messages; mousedown now updates scaled canvas mouse coordinates before command/fire handling.
- Added clearer objective copy to the callsign overlay and HUD so the player understands the loop: fuel is health, scan supplies/mines, deactivate rival tanks.
- Completed a deeper original Battlefield inspection using MobyGames, TankPit, and Wayback captures of the 2004-2007 playbattlefield.com shell, welcome page, hotkeys, Top 25, and tournament pages. Captured the actionable findings in `research/battlefield/INSPECTION.md`; no original/TankPit assets were added to the codebase.
- Added `AI_AGENT_UPGRADE_PLAYBOOK.md` as the tactical execution guide for future agents: phase order, likely files, acceptance checks, validation commands, and the legal asset boundary.
