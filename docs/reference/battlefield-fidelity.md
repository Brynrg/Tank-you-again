# Battlefield / TankPit fidelity reference

**Reference game:** the classic 2D *Battlefield* (Bonus.com, 1997 →
playbattlefield.com, shut down 2008), as preserved and modernized by
**TankPit** (2012). This is **not** the EA/DICE FPS series.

Goal: clone the *feel* of the original — never its copyrighted assets.

## Verified mechanics (sources below)

- **Point-and-click control.** Click the field to **move**; click an enemy tank
  or mine to **shoot it**; click-and-hold a fuel/equipment canister to **grab**
  it. A MAP button opens a map; clicking it **teleports**.
- **Fuel is both health and the action economy.** Moving, shooting, laying
  mines, using radar, teleporting, **and taking hits** all spend fuel. Zero fuel
  = the tank is **deactivated** (must respawn). Refuel from hidden canisters; a
  tank can also **deposit** fuel anywhere on the map.
- **Equipment** drops from pickups **or from destroying enemy tanks**: stronger
  weapons, protective **shields**, and **long-range radar**. Radar reveals
  hidden fuel/equipment pickups and enemy mines in a radius.
- **Mines** are placed traps, hidden unless owned/allied/radar-revealed.
- **Four teams:** orange, purple, blue, red.
- **Ranks:** recruit → private → corporal → sergeant → lieutenant → captain →
  major → colonel → general. Promotion requires deactivating opponents of a
  qualifying rank plus promotion points; being deactivated can demote you.
- **Combat lock / anti-quit:** you cannot leave immediately during combat; you
  must cool down for a few seconds. Disconnected tanks linger and can reconnect.

## How this repo maps to the reference (as of this pass)

Implemented in the single-player engine (`client/src/single-player-net.ts`) and
shared tunables (`shared/types.ts`):

- ✅ Click enemy/mine = fire, click ground = move (`client/src/input.ts`).
- ✅ Fuel-as-health with move/fire/mine/radar/teleport costs.
- ✅ Radar now costs fuel **and** a charge (was charge-only).
- ✅ Equipment + fuel **salvage drops** when a tank is destroyed.
- ✅ **Deposit fuel** (`F`) drops a recoverable canister.
- ✅ Larger field of play: **3547×3547** (3× the original 2048² area).
- ✅ Four teams, fuel-as-health, mines with radar masking, respawn protection.

Still divergent from full TankPit fidelity (future work — see
`BATTLEFIELD_FIDELITY_UPGRADE_PLAN.md`):

- Promotion-point / rank-band deactivation rules (currently XP-threshold).
- Combat-lock anti-quit and reconnectable tank sessions.
- Map features: water/ferries, draggable obstacles, team bases.
- Equipment capacity by rank; multiple weapon tiers (dual shot, etc.).

## Sources

- TankPit on Kongregate — controls, teams, ranks, fuel, equipment:
  https://www.kongregate.com/en/games/zoomorph/tankpit
- TankPit (2012) — MobyGames (fuel economy, radar, mines, ferries, promotion):
  https://www.mobygames.com/game/71759/tankpit/
- Battlefield (1997) — MobyGames: https://www.mobygames.com/game/71758/battlefield/
- TankPit — About (history, 4 colors, 50+ tournament maps):
  https://tankpit.com/about
- TankPit — Help (anti-quit, promotion, base-mine behavior): https://tankpit.com/help
- "What is TankPit?" overview (teams, rank ladder, fuel-as-health):
  https://medium.com/@uzairkhan_27092/what-is-tankpit-6fc819647086
