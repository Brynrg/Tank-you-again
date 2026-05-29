import {
  ClientMessageType,
  type ClientFireMessage,
  type ClientInputMessage,
  type ClientMoveToMessage,
  type ClientPlaceMineMessage,
  type ClientStopMessage,
  ItemType,
  ProjectileKind,
  type ClientUseItemMessage,
} from "@shared/types";

import type { Camera } from "./render.js";

/**
 * Lightweight input layer:
 *   - Left click issues a server-owned move command
 *   - WASD + arrows remain as a legacy/direct-control fallback
 *   - Mouse position → aim angle (turret + projectile direction)
 *   - Space → bullet
 *   - Right click (or `K`) → missile
 *   - `M` → place mine
 *   - `R` → active radar scan
 *   - `Shift` → toggle shield
 *   - `X` / Escape → stop current move command
 *
 * `attach(canvas, camera)` wires the listeners. `currentInput(clientTick)`
 * snapshots the input state into an INPUT message ready to send. `consumeFireQueue()` etc.
 * drain one-shot intents (firing) so they aren't double-counted.
 */
export interface InputLayer {
  detach(): void;
  currentInput(clientTick: number): ClientInputMessage;
  consumeCommandQueue(clientTick: number): Array<ClientMoveToMessage | ClientStopMessage>;
  clearCommandTarget(): void;
  consumeFireQueue(): ClientFireMessage[];
  consumeMineQueue(): ClientPlaceMineMessage[];
  consumeUseItemQueue(): ClientUseItemMessage[];
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
  let commandTarget: { x: number; y: number } | null = null;

  function onKeyDown(e: KeyboardEvent): void {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.add(k);
    if (e.repeat) return;
    if (k === "m") mineQueue.push({ type: ClientMessageType.PLACE_MINE });
    else if (k === "k")
      fireQueue.push({ type: ClientMessageType.FIRE, weapon: ProjectileKind.MISSILE });
    else if (k === "r")
      useItemQueue.push({ type: ClientMessageType.USE_ITEM, item: ItemType.RADAR });
    else if (k === " ") {
      e.preventDefault();
      fireQueue.push({
        type: ClientMessageType.FIRE,
        weapon: ProjectileKind.BULLET,
        aim: currentAim(),
      });
    } else if (k === "x" || k === "Escape") {
      commandTarget = null;
      commandQueue.push({ type: ClientMessageType.STOP });
    } else if (k === "Shift")
      useItemQueue.push({ type: ClientMessageType.USE_ITEM, item: ItemType.SHIELD });
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
    if (e.button === 0) {
      const target = screenToWorld(e);
      if (e.detail === 2) {
        // Double-click
        fireQueue.push({
          type: ClientMessageType.FIRE,
          weapon: ProjectileKind.BULLET,
          aim: currentAim(),
        });
      } else {
        // Single-click
        commandTarget = target;
        commandQueue.push({ type: ClientMessageType.MOVE_TO, x: target.x, y: target.y });
      }
    } else if (e.button === 2) {
      // Right-click
      e.preventDefault();
      fireQueue.push({
        type: ClientMessageType.FIRE,
        weapon: ProjectileKind.MISSILE,
        aim: currentAim(),
      });
    }
  }

  let isHolding = false;
  let holdStartTime = 0;
  let holdTarget: { x: number; y: number } | null = null;

  function onMouseUp(e: MouseEvent): void {
    if (e.button === 0 && isHolding) {
      const target = screenToWorld(e);
      if (Date.now() - holdStartTime < 300) {
        // Short click
        commandTarget = target;
        commandQueue.push({ type: ClientMessageType.MOVE_TO, x: target.x, y: target.y });
      } else {
        // Long press (hold)
        if (holdTarget) {
          useItemQueue.push({
            type: ClientMessageType.USE_ITEM,
            item:
              holdTarget.type === ItemType.FUEL_CRATE
                ? ItemType.FUEL_CRATE
                : holdTarget.type === ItemType.MISSILE
                  ? ItemType.MISSILE
                  : holdTarget.type === ItemType.MINE_PACK
                    ? ItemType.MINE_PACK
                    : holdTarget.type === ItemType.SHIELD
                      ? ItemType.SHIELD
                      : holdTarget.type === ItemType.RADAR
                        ? ItemType.RADAR
                        : ItemType.TELEPORT_CHARGE,
          });
        }
      }
      isHolding = false;
      holdTarget = null;
    }
  }

  function onMouseMove(e: MouseEvent): void {
    updateMouse(e);

    // Check if we're over a pickup
    if (isHolding && lastSnapshot) {
      const worldPos = screenToWorld(e);
      const pickup = lastSnapshot.pickups.find((p) => {
        const dx = worldPos.x - p.x;
        const dy = worldPos.y - p.y;
        return Math.hypot(dx, dy) < PICKUP_RADIUS + TANK_RADIUS;
      });
      if (pickup) {
        holdTarget = pickup;
      }
    }
  }

  function onMouseDown(e: MouseEvent): void {
    updateMouse(e);

    if (e.button === 0) {
      const target = screenToWorld(e);
      if (e.detail === 2) {
        // Double-click
        fireQueue.push({
          type: ClientMessageType.FIRE,
          weapon: ProjectileKind.BULLET,
          aim: currentAim(),
        });
      } else {
        // Single-click
        commandTarget = target;
        commandQueue.push({ type: ClientMessageType.MOVE_TO, x: target.x, y: target.y });
      }
    } else if (e.button === 2) {
      // Right-click
      e.preventDefault();
      fireQueue.push({
        type: ClientMessageType.FIRE,
        weapon: ProjectileKind.MISSILE,
        aim: currentAim(),
      });
    }
  }

  function onMouseUp(e: MouseEvent): void {
    if (e.button === 0 && isHolding) {
      const target = screenToWorld(e);
      if (Date.now() - holdStartTime < 300) {
        // Short click
        commandTarget = target;
        commandQueue.push({ type: ClientMessageType.MOVE_TO, x: target.x, y: target.y });
      } else {
        // Long press (hold)
        if (holdTarget) {
          useItemQueue.push({
            type: ClientMessageType.USE_ITEM,
            item:
              holdTarget.type === ItemType.FUEL_CRATE
                ? ItemType.FUEL_CRATE
                : holdTarget.type === ItemType.MISSILE
                  ? ItemType.MISSILE
                  : holdTarget.type === ItemType.MINE_PACK
                    ? ItemType.MINE_PACK
                    : holdTarget.type === ItemType.SHIELD
                      ? ItemType.SHIELD
                      : holdTarget.type === ItemType.RADAR
                        ? ItemType.RADAR
                        : ItemType.TELEPORT_CHARGE,
          });
        }
      }
      isHolding = false;
      holdTarget = null;
    }
  }

  function onMouseMove(e: MouseEvent): void {
    updateMouse(e);

    // Check if we're over a pickup
    if (isHolding && lastSnapshot) {
      const worldPos = screenToWorld(e);
      const pickup = lastSnapshot.pickups.find((p) => {
        const dx = worldPos.x - p.x;
        const dy = worldPos.y - p.y;
        return Math.hypot(dx, dy) < PICKUP_RADIUS + TANK_RADIUS;
      });
      if (pickup) {
        holdTarget = pickup;
      }
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

  function currentAim(): number {
    // Convert screen mouse pos → world coords using the camera, then atan2
    // from the player's own tank to the world cursor. We don't know the
    // player tank's world position here, so callers should re-compute aim
    // from the latest snapshot — `currentAim` only gives "aim toward cursor
    // assuming player is at camera focus."
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const dx = (mouseX - cx) / camera.zoom;
    const dy = (mouseY - cy) / camera.zoom;
    return Math.atan2(dy, dx);
  }

  function screenToWorld(e: MouseEvent): { x: number; y: number } {
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
    currentInput(clientTick: number): ClientInputMessage {
      return {
        type: ClientMessageType.INPUT,
        clientTick,
        up: keys.has("w") || keys.has("ArrowUp"),
        down: keys.has("s") || keys.has("ArrowDown"),
        left: keys.has("a") || keys.has("ArrowLeft"),
        right: keys.has("d") || keys.has("ArrowRight"),
        aim: currentAim(),
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
    getCommandTarget() {
      return commandTarget;
    },
  };
}
