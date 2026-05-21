# Battlefield 2006 Inspection

Date: 2026-05-21

Target: Bonus.com / playbattlefield.com `Battlefield`, the 2D browser tank game
that TankPit later revived. This is not the EA/DICE FPS series.

## Source Trail

- MobyGames identifies `Battlefield` as a 1997 browser game by Bonus.com with
  diagonal-down 2D scrolling, point-and-select controls, turn-based pacing, tank
  combat, keyboard/mouse input, and internet multiplayer:
  <https://www.mobygames.com/game/71758/battlefield/>.
- TankPit's official about page says the original debuted on bonus.com in 1997,
  moved to playbattlefield.com, shut down in 2008, and that TankPit started in
  2012 to restore the original while making subtle improvements:
  <https://tankpit.com/about/>.
- MobyGames' TankPit entry describes the current remake as point-and-click,
  partially turn-based, four-team tank play with radar, mines, fuel, equipment,
  movable obstacles, ferries, ranks, demotion, and awards:
  <https://www.mobygames.com/game/71759/tankpit/>.
- The archived 2007 original welcome page confirms the player-facing pitch:
  fuel up, start as recruit, choose one of four teams, choose a battlefield map,
  raid enemy tanks or play solo, communicate in-game or on the bulletin board,
  register for up to 16 tanks, or play as a guest with restricted rank and no
  saved accomplishments:
  <https://web.archive.org/web/20071008055112/http://www.playbattlefield.com/battle/welcome.do>.
- The archived 2004 play page exposes the Java applet shell, not the running
  game client: `bfieldClub.class`, game size around 590 x 320, server host
  `www.playbattlefield.com`, socket port `53719`, Java requirement, skin
  selection, and side buttons for skin, hotkeys, Top 25, tournaments, and
  support:
  <https://web.archive.org/web/20040607003318/http://www.playbattlefield.com/battle/game/play.do>.
- The archived 2004 shortcut popup is the most concrete original control source:
  click moves, double-click fires, Space fires, click-and-hold picks up or drops,
  number keys toggle equipment, and other hotkeys show nearest enemy, active
  forces, active players, statistics, inventory, locator, top 10, tips, comments,
  sound, and auto-scroll:
  <https://web.archive.org/web/20040615002343/http://www.playbattlefield.com/game/shortcutkeys.html>.
- The archived 2004 Top 25 and tournament pages confirm map-specific rankings,
  troop colors, rank names, medals/awards, and tournament result tables:
  <https://web.archive.org/web/20040620084714/http://www.playbattlefield.com/game/topten.htmp>
  and
  <https://web.archive.org/web/20040620084451/http://www.playbattlefield.com/game/t_top.htmp>.
- TankPit's official downloads page currently offers a sprite pack at
  `/images/sprites.zip`. I downloaded and listed it only for structure; it
  contains dust, explosion, menu, radar, tank, and tile sprites. Those assets are
  proprietary/community work and should not be copied into this repo:
  <https://tankpit.com/downloads>.

## Download Attempt

I did not find a lawful, runnable copy of the 2004-2008 Java game client. The
Wayback applet page is present, but the actual `bfieldClub.class` was not
available through CDX checks for the exact class path. I also avoided third-party
executables, crack bundles, and unrelated later `playbattlefield.com` captures
after the domain appears to have shifted into non-original content.

The useful downloadable material was TankPit's sprite pack. I inspected the file
list and image dimensions, then removed the archive and extracted files from the
workspace so they cannot accidentally enter source control.

## Original-Feel Mechanics

### Objective

The immediate loop is to deactivate enemy tanks while preserving enough fuel to
keep fighting. The larger loop is rank, medals, tournament placement, team pride,
and persistent tank identity. The game should make that clear from the first
screen and HUD.

### Input Model

Original control is command-first:

- Click to move.
- Double-click or Space to fire.
- Click-and-hold to pick up or drop movable objects/fuel.
- Number keys toggle equipment modes: shield, dual shot, missile, homing, extra
  radar.
- Information keys matter: nearest enemy, active forces, active players,
  statistics, inventory, locator, Top 10, tips, comments, sound, and auto-scroll.

This should not feel like a WASD twin-stick tank shooter. Mouse commands should
define destination, target, pickup/drop, and equipment use.

### Simulation Rhythm

The core description is "commands in real time, tanks execute in turns." A modern
implementation can still render smoothly, but authoritative game decisions should
feel stepped: movement advances in command ticks, shots have deliberate cadence,
and equipment toggles are commitments rather than twitch spam.

### Fuel Economy

Fuel is health and action currency. It is spent by movement, teleporting,
shooting, radar use, mines, and damage. Running out of fuel deactivates the tank.
The player should spend fuel to create advantage, then recover through hidden fuel
canisters, fuel drops, enemy deactivations, or team logistics.

### Equipment

Equipment is the combat layer, not just ammo:

- Shield on/off.
- Dual shot on/off.
- Missile on/off.
- Homing on/off.
- Extra radar on/off.
- Mines and teleporting.
- Inventory visibility and pickup/drop decisions.

Equipment should be count-limited and rank-sensitive where appropriate.

### Vision And Radar

Radar is active intelligence. It should reveal hidden fuel/equipment and enemy
mines, and extra radar should feel like a better scan mode. Snapshot payloads
should not leak hidden entity counts to clients that cannot see them.

### Maps

The original identity is map-specific. Names found in archived metadata include
Crazy Maze, Rocks and Swamp, Deep Six, Appaloosa Land, and Iceland. MobyGames and
TankPit also identify movable obstacles and ferries over water as core map
features. Top 25 pages are map-specific, so map selection is not cosmetic.

### Progression

Registered tanks matter. The original-era welcome page references a Combat
Command ID with up to 16 tanks, while TankPit documents multiple tanks with
separate ranks and scores. Rank should not be pure XP: high ranks require
deactivating qualified opponents, deactivation can demote, and awards/medals
capture long-term feats.

### Social And Competitive Shell

The site shell matters to the feel: four troop colors, Bulletin Board, Top 25,
tournaments, guest mode limits, registered persistence, support, skin selection,
and player messaging. A modern skin can simplify the old frames, but the game
needs those surfaces if it is meant to feel like Battlefield instead of only a
single arena.

## Current Tank You Again Fit

Already close:

- Server-authoritative room loop.
- Fuel-as-health.
- Click-to-move foundation.
- Active radar with per-viewer reveal state.
- Hidden pickups/mines.
- Shield/radar equipment counts.
- Basic mines, teleport, pickups, ranks, and leaderboard persistence.
- HUD now states the objective and fuel/radar loop.

Still far from original:

- Firing currently uses Space/right-click style actions, but original firing must
  support double-click and target command semantics.
- Movement is smooth destination stepping, but there is no explicit slower
  command-turn cadence yet.
- No click-and-hold pickup/drop or fuel deposit loop.
- No dual shot, homing toggle, missile toggle as persistent equipment modes.
- No nearest-enemy, active-forces, active-players, statistics, inventory, locator,
  Top 10, tips/comments, sound, or auto-scroll surfaces.
- Maps are still flat arenas, not named map manifests with obstacles, water,
  ferries, spawn/base logic, and map-specific standings.
- Progression is still mostly XP/rank thresholds, not promotion requirements,
  demotion, medals, tournament records, or 16-tank registered identity.
- Disconnect and combat-lock behavior are not yet faithful.

## Upgrade Implications

1. Add original input bindings next: double-click fire, click-and-hold
   pickup/drop, number-key equipment toggles, and an inventory/locator HUD.
2. Make firing target-aware: left-click enemy or double-click location should
   fire toward that command target; Space should fire toward the current cursor or
   selected target.
3. Move equipment from one-shot hotkeys toward toggled modes with counts and fuel
   pressure: shield, dual, missile, homing, extra radar.
4. Implement pickup/drop and fuel deposit, because the old "Click and Hold -
   Pick Up / Drop" control is a direct clue that battlefield objects and fuel
   logistics are central.
5. Replace the flat world with one named map manifest first, ideally Rocks and
   Swamp, including obstacles, water, ferry routes, spawn regions, and
   map-specific standings.
6. Add classic information panels before adding more weapons: nearest enemy,
   active players/forces, stats, inventory, locator, and Top 10 are part of the
   control vocabulary, not optional decoration.
7. Rework rank after the moment-to-moment loop: promotion requirements,
   deactivation demotion, awards, tournament snapshots, guest restrictions, and
   multiple tanks per registered account.

## Research Boundary

Use these sources to reproduce rules and feel, not copyrighted source code,
original sprites, medals, applet classes, or site artwork. Modernized original
art, UI, and map layouts should be recreated independently.
