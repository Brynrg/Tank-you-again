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
  type ClientTeleportMessage,
  type ClientUseItemMessage,
  type GameStateSnapshot,
  type TankState,
  FUEL_DEPOSIT_AMOUNT,
} from "@shared/types";

import {
  drawTouchControls,
  drawTouchToggle,
  isTouchDevice,
  layoutTouchButtons,
  layoutTouchToggle,
  type Camera,
  type TouchAction,
} from "./render.js";

/**
 * TankPit-style point-and-click input layer:
 *   - Left click on an enemy tank or mine → SHOOT it (auto-aimed)
 *   - Left click on empty ground → MOVE there
 *   - Mouse position → turret aim (for Space / hold-fire)
 *   - Space → bullet toward cursor
 *   - Right click / `K` → missile (auto-aims at a target under the cursor)
 *   - `M` → place mine
 *   - `R` → active radar scan (costs fuel)
 *   - `T` → teleport toward the cursor (range-clamped by the server)
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
  consumeTeleportQueue(): ClientTeleportMessage[];
  getCommandTarget(): { x: number; y: number } | null;
  /** Draw the on-screen touch controls (no-op when touch UI is hidden). */
  drawTouch(ctx: CanvasRenderingContext2D): void;
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
  const teleportQueue: ClientTeleportMessage[] = [];
  let commandTarget: { x: number; y: number } | null = null;

  // Latest world view, fed by updateWorld().
  let snapshot: GameStateSnapshot | null = null;
  let yourTankId = "";

  // ── Touch state ──────────────────────────────────────────────────────────
  const isTouch = isTouchDevice();
  // Touch controls show automatically on touch devices; the toggle hides them.
  let touchEnabled = isTouch;
  // When set, the next world tap teleports there instead of moving/firing.
  let pendingTeleport = false;

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
    } else if (k === "t") {
      const w = screenToWorld();
      teleportQueue.push({ type: ClientMessageType.TELEPORT, x: w.x, y: w.y });
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

  // Pointer events unify mouse + touch + pen. Mouse keeps left/right buttons;
  // touch reports button 0. Turret aim tracks the last pointer position.
  function onPointerMove(e: PointerEvent): void {
    updateMouse(e);
  }

  function onPointerDown(e: PointerEvent): void {
    updateMouse(e);

    // 1) Touch UI (toggle + action buttons) gets first crack at the pointer.
    if (handleTouchUiTap()) {
      e.preventDefault();
      return;
    }

    const world = screenToWorld();

    // 2) Right mouse button → missile (desktop only; touch uses the MIS button).
    if (e.button === 2) {
      e.preventDefault();
      fireQueue.push({
        type: ClientMessageType.FIRE,
        weapon: ProjectileKind.MISSILE,
        aim: missileAim(),
      });
      return;
    }

    // 3) Armed teleport → the tap chooses the destination.
    if (pendingTeleport) {
      pendingTeleport = false;
      teleportQueue.push({ type: ClientMessageType.TELEPORT, x: world.x, y: world.y });
      if (isTouch) e.preventDefault();
      return;
    }

    // 4) Primary tap/click: fire if it landed on an enemy/mine, otherwise move.
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
    if (isTouch) e.preventDefault();
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
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
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

  /** Aim toward the nearest living enemy — used by the touch FIRE/MIS buttons
   *  where there is no hover cursor. Falls back to the cursor aim. */
  function nearestEnemyAim(): number {
    const me = selfTank();
    if (snapshot && me) {
      let best: TankState | null = null;
      let bestD = Infinity;
      for (const t of snapshot.tanks) {
        if (t.id === yourTankId || t.isDead || t.team === me.team) continue;
        const d = Math.hypot(t.x - me.x, t.y - me.y);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      if (best) return Math.atan2(best.y - me.y, best.x - me.x);
    }
    return cursorAim();
  }

  /** Enqueue the action a touch button represents (mirrors the keyboard paths). */
  function runTouchAction(id: TouchAction): void {
    switch (id) {
      case "fire":
        fireQueue.push({
          type: ClientMessageType.FIRE,
          weapon: ProjectileKind.BULLET,
          aim: nearestEnemyAim(),
        });
        break;
      case "missile":
        fireQueue.push({
          type: ClientMessageType.FIRE,
          weapon: ProjectileKind.MISSILE,
          aim: nearestEnemyAim(),
        });
        break;
      case "mine":
        mineQueue.push({ type: ClientMessageType.PLACE_MINE });
        break;
      case "radar":
        useItemQueue.push({ type: ClientMessageType.USE_ITEM, item: ItemType.RADAR });
        break;
      case "shield":
        useItemQueue.push({ type: ClientMessageType.USE_ITEM, item: ItemType.SHIELD });
        break;
      case "deposit":
        depositQueue.push({ type: ClientMessageType.DEPOSIT_FUEL, amount: FUEL_DEPOSIT_AMOUNT });
        break;
      case "stop":
        commandTarget = null;
        commandQueue.push({ type: ClientMessageType.STOP });
        break;
      case "teleport":
        // Arm teleport: the next world tap picks the destination.
        pendingTeleport = !pendingTeleport;
        break;
    }
  }

  /** Hit-test the touch UI (toggle + buttons). Returns true if it consumed the
   *  pointer, so the world handler should ignore it. mouseX/mouseY must already
   *  be set to this pointer's canvas-buffer coords. */
  function handleTouchUiTap(): boolean {
    const W = canvas.width;
    const H = canvas.height;
    // Toggle is always available on touch devices.
    if (isTouch) {
      const tg = layoutTouchToggle();
      if (Math.hypot(mouseX - tg.cx, mouseY - tg.cy) <= tg.r) {
        touchEnabled = !touchEnabled;
        return true;
      }
    }
    if (!touchEnabled) return false;
    const buttons = layoutTouchButtons(W, H, selfTank());
    for (const b of buttons) {
      if (Math.hypot(mouseX - b.cx, mouseY - b.cy) <= b.r) {
        if (b.enabled) runTouchAction(b.id);
        return true; // consume even when disabled, so it doesn't move the tank
      }
    }
    return false;
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
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
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
    consumeTeleportQueue() {
      const out = teleportQueue.slice();
      teleportQueue.length = 0;
      return out;
    },
    getCommandTarget() {
      return commandTarget;
    },
    drawTouch(ctx: CanvasRenderingContext2D) {
      if (!isTouch) return; // desktop: no touch overlay
      drawTouchToggle(ctx, touchEnabled);
      if (!touchEnabled) return;
      const buttons = layoutTouchButtons(ctx.canvas.width, ctx.canvas.height, selfTank());
      drawTouchControls(ctx, buttons, { pendingTeleport });
    },
  };
}
