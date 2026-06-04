import type { GameStateSnapshot, ProjectileState, TankState } from "@shared/types";

/**
 * Entity interpolation. The server emits authoritative snapshots at a fixed
 * SERVER_TICK_RATE (20 Hz). Rendering the latest snapshot directly makes remote
 * tanks/projectiles visibly step at 20 Hz. This buffers recent snapshots and
 * renders slightly "in the past" (delayMs), smoothly lerping each entity's
 * position/angle between the two snapshots that bracket the render time.
 *
 * The LOCAL player's own tank is rendered at the newest snapshot (not behind),
 * so controls stay responsive — there is no client prediction, so adding the
 * interpolation delay to your own tank would feel laggy.
 */
interface Stamped {
  snap: GameStateSnapshot;
  t: number;
}

const lerp = (a: number, b: number, x: number): number => a + (b - a) * x;

/** Shortest-path angle interpolation (radians). */
function angleLerp(a: number, b: number, x: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * x;
}

export class SnapshotInterpolator {
  private buf: Stamped[] = [];
  private readonly maxBuf = 12;

  constructor(private readonly delayMs = 90) {}

  push(snap: GameStateSnapshot, nowMs: number): void {
    const last = this.buf[this.buf.length - 1];
    if (last && snap.tick <= last.snap.tick) return; // ignore stale / out-of-order
    this.buf.push({ snap, t: nowMs });
    if (this.buf.length > this.maxBuf) this.buf.shift();
  }

  latest(): GameStateSnapshot | null {
    const last = this.buf[this.buf.length - 1];
    return last ? last.snap : null;
  }

  /** A snapshot to render at `nowMs`, with remote entities interpolated. */
  sample(nowMs: number, localTankId: string): GameStateSnapshot | null {
    const newestStamped = this.buf[this.buf.length - 1];
    if (!newestStamped) return null;
    const newest = newestStamped.snap;
    if (this.buf.length === 1) return newest;

    const renderT = nowMs - this.delayMs;
    let a: Stamped | null = null;
    let b: Stamped | null = null;
    for (let i = 0; i < this.buf.length - 1; i++) {
      const cur = this.buf[i];
      const next = this.buf[i + 1];
      if (cur && next && cur.t <= renderT && next.t >= renderT) {
        a = cur;
        b = next;
        break;
      }
    }
    // Not enough buffered history yet (render time is newer than newest sample).
    if (!a || !b) return newest;

    const span = b.t - a.t;
    const alpha = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
    return this.blend(a.snap, b.snap, alpha, newest, localTankId);
  }

  private blend(
    a: GameStateSnapshot,
    b: GameStateSnapshot,
    alpha: number,
    newest: GameStateSnapshot,
    localTankId: string,
  ): GameStateSnapshot {
    const aTanks = new Map(a.tanks.map((t) => [t.id, t]));
    const localLatest = newest.tanks.find((t) => t.id === localTankId);

    const tanks: TankState[] = b.tanks.map((tb) => {
      if (tb.id === localTankId && localLatest) return localLatest; // local: newest, no lag
      const ta = aTanks.get(tb.id);
      if (!ta) return tb;
      return {
        ...tb,
        x: lerp(ta.x, tb.x, alpha),
        y: lerp(ta.y, tb.y, alpha),
        angle: angleLerp(ta.angle, tb.angle, alpha),
        turretAngle: angleLerp(ta.turretAngle, tb.turretAngle, alpha),
      };
    });

    const aProj = new Map(a.projectiles.map((p) => [p.id, p]));
    const projectiles: ProjectileState[] = b.projectiles.map((pb) => {
      const pa = aProj.get(pb.id);
      if (!pa) return pb;
      return { ...pb, x: lerp(pa.x, pb.x, alpha), y: lerp(pa.y, pb.y, alpha) };
    });

    // Static-ish sets + events come from the newest snapshot so pickups/mines
    // and kill/feed events are never shown stale.
    return {
      tick: newest.tick,
      timestamp: newest.timestamp,
      tanks,
      projectiles,
      pickups: newest.pickups,
      visibleMines: newest.visibleMines,
      events: newest.events,
    };
  }
}
