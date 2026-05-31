import {
  ClientMessageType,
  ItemType,
  MINE_RADIUS,
  ProjectileKind,
  TANK_RADIUS,
  type ClientDepositFuelMessage,
  type ClientFireMessage,
  type ClientInputMessage,
  type ClientMoveToMessage,
  type ClientPlaceMineMessage,
  type ClientStopMessage,
  type ClientUseItemMessage,
  type GameStateSnapshot,
  type TankState,
  FUEL_DEPOSIT_AMOUNT,
} from "@shared/types";

import type { Camera } from "./render.js";

/**
 * TankPit-style point-and-click input layer:
 *   - Left click on an enemy tank or mine → SHOOT it (auto-aimed)
 *   - Left click on empty ground → MOVE there
 *   - Mouse position → turret aim (for Space / hold-fire)
 *   - Space → bullet toward cursor
 *   - Right click / `K` → missile (auto-aims at a target under the cursor)
 *   - `M` → place mine
 *   - `R` → active radar scan (costs fuel)
 *   - `F` → deposit a fuel canister at your position
 *   - `Shift` → toggle shield
 *   - `X` / Escape → stop the current move command
 *   - WASD / arrows → optional direct driving fallback
 *
 * `attach(canvas, camera)` wires listeners. `updateWorld()` feeds the latest
 * snapshot so clicks can be resolved against live enemy/mine positions.
 */
export interface InputLayer {
  detach(): void;
  /** Feed the latest snapshot + local tank id so clicks can target entities. */
  updateWorld(snapshot: GameStateSnapshot, yourTankId: string): void;
  currentInput(clientTick: number): ClientInputMessage;
  consumeCommandQueue(clientTick: number): Array<ClientMoveToMessage | ClientStopMessage>;
  clearCommandTarget(): void;
  consumeFireQueue(): ClientFireMessage[];
  consumeMineQueue(): ClientPlaceMineMessage[];
  consumeUseItemQueue(): ClientUseItemMessage[];
  consumeDepositQueue(): ClientDepositFuelMessage[];
  getCommandTarget(): { x: number; y: number } | null;
}

export function attach(canvas: HTMLCanvasElement, camera: Camera): InputLayer {
  const keys = new Set<string>();
  let mouseX = 0;
  let mouseY = 0;
  const fireQueue: ClientFireMessage[] = [];
  const commandQueue: Array<
    Omit<ClientMoveToMessage, "clientTick"> | Omit<ClientStopMessage, "clientTick">
  > = [];
  const mineQueue: ClientPlaceMineMessage[] = [];
  const useItemQueue: ClientUseItemMessage[] = [];
  const depositQueue: ClientDepositFuelMessage[] = [];
  let commandTarget: { x: number; y: number } | null = null;

  // Latest world view, fed by updateWorld().
  let snapshot: GameStateSnapshot | null = null;
  let yourTankId = "";

  function selfTank(): TankState | null {
    return snapshot?.tanks.find((t) => t.id === yourTankId) ?? null;
  }

  /** Aim angle from the local tank toward a world point. */
  function aimAt(target: { x: number; y: number }): number {
    const me = selfTank();
    if (me) return Math.atan2(target.y - me.y, target.x - me.x);
    // Fallback: assume the tank sits at the camera focus (it does — camera follows it).
    return Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
  }

  /**
   * Resolve a world-space click to an enemy tank or visible mine, if one is
   * close enough to be considered "clicked on". Returns null for empty ground.
   */
  function targetAt(world: { x: number; y: number }): { x: number; y: number } | null {
    if (!snapshot) return null;
    const me = selfTank();
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;

    for (const t of snapshot.tanks) {
      if (t.id === yourTankId || t.isDead) continue;
      if (me && t.team === me.team) continue; // don't shoot allies
      const d = Math.hypot(t.x - world.x, t.y - world.y);
      if (d <= TANK_RADIUS * 1.8 && d < bestDist) {
        bestDist = d;
        best = { x: t.x, y: t.y };
      }
    }
    for (const m of snapshot.visibleMines) {
      const d = Math.hypot(m.x - world.x, m.y - world.y);
      if (d <= MINE_RADIUS && d < bestDist) {
        bestDist = d;
        best = { x: m.x, y: m.y };
      }
    }
    return best;
  }

  function onKeyDown(e: KeyboardEvent): void {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.add(k);
    if (e.repeat) return;
    if (k === "m") {
      mineQueue.push({ type: ClientMessageType.PLACE_MINE });
    } else if (k === "k") {
      fireQueue.push({
        type: ClientMessageType.FIRE,
        weapon: ProjectileKind.MISSILE,
        aim: missileAim(),
      });
    } else if (k === "r") {
      useItemQueue.push({ type: ClientMessageType.USE_ITEM, item: ItemType.RADAR });
    } else if (k === "f") {
      depositQueue.push({ type: ClientMessageType.DEPOSIT_FUEL, amount: FUEL_DEPOSIT_AMOUNT });
    } else if (k === " ") {
      e.preventDefault();
      fireQueue.push({
        type: ClientMessageType.FIRE,
        weapon: ProjectileKind.BULLET,
        aim: cursorAim(),
      });
    } else if (k === "x" || k === "Escape") {
      commandTarget = null;
      commandQueue.push({ type: ClientMessageType.STOP });
    } else if (k === "Shift") {
      useItemQueue.push({ type: ClientMessageType.USE_ITEM, item: ItemType.SHIELD });
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.delete(k);
  }

  function onMouseMove(e: MouseEvent): void {
    updateMouse(e);
  }

  function onMouseDown(e: MouseEvent): void {
    updateMouse(e);
    const world = screenToWorld();
    if (e.button === 0) {
      // Left click: shoot if it landed on an enemy/mine, otherwise move.
      const target = targetAt(world);
      if (target) {
        fireQueue.push({
          type: ClientMessageType.FIRE,
          weapon: ProjectileKind.BULLET,
          aim: aimAt(target),
        });
      } else {
        commandTarget = world;
        commandQueue.push({ type: ClientMessageType.MOVE_TO, x: world.x, y: world.y });
      }
    } else if (e.button === 2) {
      // Right click: fire a missile, auto-aimed at a target under the cursor.
      e.preventDefault();
      fireQueue.push({
        type: ClientMessageType.FIRE,
        weapon: ProjectileKind.MISSILE,
        aim: missileAim(),
      });
    }
  }

  function onContextMenu(e: Event): void {
    e.preventDefault();
  }
  function onBlur(): void {
    keys.clear();
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("contextmenu", onContextMenu);

  /** Aim toward the world cursor from the local tank. */
  function cursorAim(): number {
    return aimAt(screenToWorld());
  }

  /** Missile aim: lock onto an enemy/mine under the cursor, else aim at cursor. */
  function missileAim(): number {
    const world = screenToWorld();
    const target = targetAt(world);
    return aimAt(target ?? world);
  }

  function screenToWorld(): { x: number; y: number } {
    return {
      x: camera.x + (mouseX - canvas.width / 2) / camera.zoom,
      y: camera.y + (mouseY - canvas.height / 2) / camera.zoom,
    };
  }

  function updateMouse(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouseX = (e.clientX - rect.left) * scaleX;
    mouseY = (e.clientY - rect.top) * scaleY;
  }

  return {
    detach() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("contextmenu", onContextMenu);
    },
    updateWorld(snap: GameStateSnapshot, id: string) {
      snapshot = snap;
      yourTankId = id;
    },
    currentInput(clientTick: number): ClientInputMessage {
      return {
        type: ClientMessageType.INPUT,
        clientTick,
        up: keys.has("w") || keys.has("ArrowUp"),
        down: keys.has("s") || keys.has("ArrowDown"),
        left: keys.has("a") || keys.has("ArrowLeft"),
        right: keys.has("d") || keys.has("ArrowRight"),
        aim: cursorAim(),
      };
    },
    consumeCommandQueue(clientTick: number) {
      const out = commandQueue.map((cmd) => ({ ...cmd, clientTick }));
      commandQueue.length = 0;
      return out;
    },
    clearCommandTarget() {
      commandTarget = null;
    },
    consumeFireQueue() {
      const out = fireQueue.slice();
      fireQueue.length = 0;
      return out;
    },
    consumeMineQueue() {
      const out = mineQueue.slice();
      mineQueue.length = 0;
      return out;
    },
    consumeUseItemQueue() {
      const out = useItemQueue.slice();
      useItemQueue.length = 0;
      return out;
    },
    consumeDepositQueue() {
      const out = depositQueue.slice();
      depositQueue.length = 0;
      return out;
    },
    getCommandTarget() {
      return commandTarget;
    },
  };
}
