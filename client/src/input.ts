import {
  ClientMessageType,
  ItemType,
  MINE_RADIUS,
  PICKUP_RADIUS,
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
  /** Current desktop cursor reticle (screen-buffer coords + intent), or null on
   *  touch devices where there is no hover cursor. */
  getCursor(): { x: number; y: number; kind: CursorKind } | null;
  /** Draw the on-screen touch controls (no-op when touch UI is hidden). */
  drawTouch(ctx: CanvasRenderingContext2D): void;
}

/** What a left-click at the current cursor will do — drives the reticle color.
 *  `fire` = a bullet (enemy/mine under cursor, or force-fire); `equipment` =
 *  loot you'll roll over to collect; `move` = relocate to empty ground. */
export type CursorKind = "fire" | "equipment" | "move";

class InputHandler implements InputLayer {
  private keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private fireQueue: ClientFireMessage[] = [];
  private commandQueue: Array<
    Omit<ClientMoveToMessage, "clientTick"> | Omit<ClientStopMessage, "clientTick">
  > = [];
  private mineQueue: ClientPlaceMineMessage[] = [];
  private useItemQueue: ClientUseItemMessage[] = [];
  private depositQueue: ClientDepositFuelMessage[] = [];
  private teleportQueue: ClientTeleportMessage[] = [];
  private commandTarget: { x: number; y: number } | null = null;

  // Latest world view, fed by updateWorld().
  private snapshot: GameStateSnapshot | null = null;
  private yourTankId = "";

  // ── Touch state ──────────────────────────────────────────────────────────
  private isTouch = isTouchDevice();
  // Touch controls show automatically on touch devices; the toggle hides them.
  private touchEnabled = this.isTouch;
  // When set, the next world tap teleports there instead of moving/firing.
  private pendingTeleport = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: Camera,
  ) {
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onBlur = this.onBlur.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
  }

  updateWorld(snap: GameStateSnapshot, id: string): void {
    this.snapshot = snap;
    this.yourTankId = id;
  }

  currentInput(clientTick: number): ClientInputMessage {
    return {
      type: ClientMessageType.INPUT,
      clientTick,
      up: this.keys.has("w") || this.keys.has("ArrowUp"),
      down: this.keys.has("s") || this.keys.has("ArrowDown"),
      left: this.keys.has("a") || this.keys.has("ArrowLeft"),
      right: this.keys.has("d") || this.keys.has("ArrowRight"),
      aim: this.cursorAim(),
    };
  }

  consumeCommandQueue(clientTick: number) {
    const out = this.commandQueue.map((cmd) => ({ ...cmd, clientTick }));
    this.commandQueue.length = 0;
    return out;
  }

  clearCommandTarget(): void {
    this.commandTarget = null;
  }

  consumeFireQueue(): ClientFireMessage[] {
    const out = this.fireQueue.slice();
    this.fireQueue.length = 0;
    return out;
  }

  consumeMineQueue(): ClientPlaceMineMessage[] {
    const out = this.mineQueue.slice();
    this.mineQueue.length = 0;
    return out;
  }

  consumeUseItemQueue(): ClientUseItemMessage[] {
    const out = this.useItemQueue.slice();
    this.useItemQueue.length = 0;
    return out;
  }

  consumeDepositQueue(): ClientDepositFuelMessage[] {
    const out = this.depositQueue.slice();
    this.depositQueue.length = 0;
    return out;
  }

  consumeTeleportQueue(): ClientTeleportMessage[] {
    const out = this.teleportQueue.slice();
    this.teleportQueue.length = 0;
    return out;
  }

  getCommandTarget(): { x: number; y: number } | null {
    return this.commandTarget;
  }

  getCursor(): { x: number; y: number; kind: CursorKind } | null {
    if (this.isTouch) return null;
    return { x: this.mouseX, y: this.mouseY, kind: this.cursorKind() };
  }

  drawTouch(ctx: CanvasRenderingContext2D): void {
    if (!this.isTouch) return; // desktop: no touch overlay
    drawTouchToggle(ctx, this.touchEnabled);
    if (!this.touchEnabled) return;
    const buttons = layoutTouchButtons(ctx.canvas.width, ctx.canvas.height, this.selfTank());
    drawTouchControls(ctx, buttons, { pendingTeleport: this.pendingTeleport });
  }

  private selfTank(): TankState | null {
    return this.snapshot?.tanks.find((t) => t.id === this.yourTankId) ?? null;
  }

  /** Aim angle from the local tank toward a world point. */
  private aimAt(target: { x: number; y: number }): number {
    const me = this.selfTank();
    if (me) return Math.atan2(target.y - me.y, target.x - me.x);
    // Fallback: assume the tank sits at the camera focus (it does — camera follows it).
    return Math.atan2(this.mouseY - this.canvas.height / 2, this.mouseX - this.canvas.width / 2);
  }

  /**
   * Resolve a world-space click to an enemy tank or visible mine, if one is
   * close enough to be considered "clicked on". Returns null for empty ground.
   */
  private targetAt(world: { x: number; y: number }): { x: number; y: number } | null {
    if (!this.snapshot) return null;
    const me = this.selfTank();
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;

    for (const t of this.snapshot.tanks) {
      if (t.id === this.yourTankId || t.isDead) continue;
      if (me && t.team === me.team) continue; // don't shoot allies
      const d = Math.hypot(t.x - world.x, t.y - world.y);
      if (d <= TANK_RADIUS * 1.8 && d < bestDist) {
        bestDist = d;
        best = { x: t.x, y: t.y };
      }
    }
    for (const m of this.snapshot.visibleMines) {
      const d = Math.hypot(m.x - world.x, m.y - world.y);
      if (d <= MINE_RADIUS && d < bestDist) {
        bestDist = d;
        best = { x: m.x, y: m.y };
      }
    }
    return best;
  }

  /** Is there a (proximity-revealed) pickup under this world point? */
  private pickupAt(world: { x: number; y: number }): boolean {
    if (!this.snapshot) return false;
    for (const p of this.snapshot.pickups) {
      if (Math.hypot(p.x - world.x, p.y - world.y) <= PICKUP_RADIUS * 2) return true;
    }
    return false;
  }

  /** Classify what a left-click would do right now, for the reticle color.
   *  Honors the force-move (Alt) / force-fire (Ctrl/Meta) modifiers. */
  private cursorKind(): CursorKind {
    if (this.keys.has("Alt")) return "move";
    if (this.keys.has("Control") || this.keys.has("Meta")) return "fire";
    const world = this.screenToWorld();
    if (this.targetAt(world)) return "fire";
    if (this.pickupAt(world)) return "equipment";
    return "move";
  }

  private onKeyDown(e: KeyboardEvent): void {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    this.keys.add(k);
    if (e.repeat) return;
    if (k === "m") {
      this.mineQueue.push({ type: ClientMessageType.PLACE_MINE });
    } else if (k === "k") {
      this.fireQueue.push({
        type: ClientMessageType.FIRE,
        weapon: ProjectileKind.MISSILE,
        aim: this.missileAim(),
      });
    } else if (k === "r") {
      this.useItemQueue.push({ type: ClientMessageType.USE_ITEM, item: ItemType.RADAR });
    } else if (k === "f") {
      this.depositQueue.push({ type: ClientMessageType.DEPOSIT_FUEL, amount: FUEL_DEPOSIT_AMOUNT });
    } else if (k === "t") {
      const w = this.screenToWorld();
      this.teleportQueue.push({ type: ClientMessageType.TELEPORT, x: w.x, y: w.y });
    } else if (k === " ") {
      e.preventDefault();
      this.fireQueue.push({
        type: ClientMessageType.FIRE,
        weapon: ProjectileKind.BULLET,
        aim: this.cursorAim(),
      });
    } else if (k === "x" || k === "Escape") {
      this.commandTarget = null;
      this.commandQueue.push({ type: ClientMessageType.STOP });
    } else if (k === "Shift") {
      this.useItemQueue.push({ type: ClientMessageType.USE_ITEM, item: ItemType.SHIELD });
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    this.keys.delete(k);
  }

  // Pointer events unify mouse + touch + pen. Mouse keeps left/right buttons;
  // touch reports button 0. Turret aim tracks the last pointer position.
  private onPointerMove(e: PointerEvent): void {
    this.updateMouse(e);
  }

  private onPointerDown(e: PointerEvent): void {
    this.updateMouse(e);

    // 1) Touch UI (toggle + action buttons) gets first crack at the pointer.
    if (this.handleTouchUiTap()) {
      e.preventDefault();
      return;
    }

    const world = this.screenToWorld();

    // 2) Right mouse button → missile (desktop only; touch uses the MIS button).
    if (e.button === 2) {
      e.preventDefault();
      this.fireQueue.push({
        type: ClientMessageType.FIRE,
        weapon: ProjectileKind.MISSILE,
        aim: this.missileAim(),
      });
      return;
    }

    // 3) Armed teleport → the tap chooses the destination.
    if (this.pendingTeleport) {
      this.pendingTeleport = false;
      this.teleportQueue.push({ type: ClientMessageType.TELEPORT, x: world.x, y: world.y });
      if (this.isTouch) e.preventDefault();
      return;
    }

    // 4) Primary tap/click. Modifiers force the intent so a missed target
    //    click never repositions you at the wrong moment:
    //      Alt        → always move
    //      Ctrl/Meta  → always fire (toward the cursor / locked target)
    //    Otherwise: fire if the click landed on an enemy/mine, else move.
    const target = this.targetAt(world);
    const forceMove = e.altKey;
    const forceFire = e.ctrlKey || e.metaKey;
    if (forceMove) {
      this.commandTarget = world;
      this.commandQueue.push({ type: ClientMessageType.MOVE_TO, x: world.x, y: world.y });
    } else if (forceFire || target) {
      this.fireQueue.push({
        type: ClientMessageType.FIRE,
        weapon: ProjectileKind.BULLET,
        aim: this.aimAt(target ?? world),
      });
    } else {
      this.commandTarget = world;
      this.commandQueue.push({ type: ClientMessageType.MOVE_TO, x: world.x, y: world.y });
    }
    if (this.isTouch) e.preventDefault();
  }

  private onContextMenu(e: Event): void {
    e.preventDefault();
  }

  private onBlur(): void {
    this.keys.clear();
  }

  /** Aim toward the world cursor from the local tank. */
  private cursorAim(): number {
    return this.aimAt(this.screenToWorld());
  }

  /** Missile aim: lock onto an enemy/mine under the cursor, else aim at cursor. */
  private missileAim(): number {
    const world = this.screenToWorld();
    const target = this.targetAt(world);
    return this.aimAt(target ?? world);
  }

  /** Aim toward the nearest living enemy — used by the touch FIRE/MIS buttons
   *  where there is no hover cursor. Falls back to the cursor aim. */
  private nearestEnemyAim(): number {
    const me = this.selfTank();
    if (this.snapshot && me) {
      let best: TankState | null = null;
      let bestD = Infinity;
      for (const t of this.snapshot.tanks) {
        if (t.id === this.yourTankId || t.isDead || t.team === me.team) continue;
        const d = Math.hypot(t.x - me.x, t.y - me.y);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      if (best) return Math.atan2(best.y - me.y, best.x - me.x);
    }
    return this.cursorAim();
  }

  /** Enqueue the action a touch button represents (mirrors the keyboard paths). */
  private runTouchAction(id: TouchAction): void {
    switch (id) {
      case "fire":
        this.fireQueue.push({
          type: ClientMessageType.FIRE,
          weapon: ProjectileKind.BULLET,
          aim: this.nearestEnemyAim(),
        });
        break;
      case "missile":
        this.fireQueue.push({
          type: ClientMessageType.FIRE,
          weapon: ProjectileKind.MISSILE,
          aim: this.nearestEnemyAim(),
        });
        break;
      case "mine":
        this.mineQueue.push({ type: ClientMessageType.PLACE_MINE });
        break;
      case "radar":
        this.useItemQueue.push({ type: ClientMessageType.USE_ITEM, item: ItemType.RADAR });
        break;
      case "shield":
        this.useItemQueue.push({ type: ClientMessageType.USE_ITEM, item: ItemType.SHIELD });
        break;
      case "deposit":
        this.depositQueue.push({
          type: ClientMessageType.DEPOSIT_FUEL,
          amount: FUEL_DEPOSIT_AMOUNT,
        });
        break;
      case "stop":
        this.commandTarget = null;
        this.commandQueue.push({ type: ClientMessageType.STOP });
        break;
      case "teleport":
        // Arm teleport: the next world tap picks the destination.
        this.pendingTeleport = !this.pendingTeleport;
        break;
    }
  }

  /** Hit-test the touch UI (toggle + buttons). Returns true if it consumed the
   *  pointer, so the world handler should ignore it. mouseX/mouseY must already
   *  be set to this pointer's canvas-buffer coords. */
  private handleTouchUiTap(): boolean {
    const W = this.canvas.width;
    const H = this.canvas.height;
    // Toggle is always available on touch devices.
    if (this.isTouch) {
      const tg = layoutTouchToggle();
      if (Math.hypot(this.mouseX - tg.cx, this.mouseY - tg.cy) <= tg.r) {
        this.touchEnabled = !this.touchEnabled;
        return true;
      }
    }
    if (!this.touchEnabled) return false;
    const buttons = layoutTouchButtons(W, H, this.selfTank());
    for (const b of buttons) {
      if (Math.hypot(this.mouseX - b.cx, this.mouseY - b.cy) <= b.r) {
        if (b.enabled) this.runTouchAction(b.id);
        return true; // consume even when disabled, so it doesn't move the tank
      }
    }
    return false;
  }

  private screenToWorld(): { x: number; y: number } {
    return {
      x: this.camera.x + (this.mouseX - this.canvas.width / 2) / this.camera.zoom,
      y: this.camera.y + (this.mouseY - this.canvas.height / 2) / this.camera.zoom,
    };
  }

  private updateMouse(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    this.mouseX = (e.clientX - rect.left) * scaleX;
    this.mouseY = (e.clientY - rect.top) * scaleY;
  }
}

export function attach(canvas: HTMLCanvasElement, camera: Camera): InputLayer {
  return new InputHandler(canvas, camera);
}
