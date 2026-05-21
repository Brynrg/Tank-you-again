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
    else if (k === " ") {
      e.preventDefault();
      fireQueue.push({ type: ClientMessageType.FIRE, weapon: ProjectileKind.BULLET });
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
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  }
  function onMouseDown(e: MouseEvent): void {
    if (e.button === 0) {
      const target = screenToWorld(e);
      commandTarget = target;
      commandQueue.push({ type: ClientMessageType.MOVE_TO, x: target.x, y: target.y });
    } else if (e.button === 2) {
      e.preventDefault();
      fireQueue.push({ type: ClientMessageType.FIRE, weapon: ProjectileKind.MISSILE });
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
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return {
      x: camera.x + (sx - canvas.width / 2) / camera.zoom,
      y: camera.y + (sy - canvas.height / 2) / camera.zoom,
    };
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
