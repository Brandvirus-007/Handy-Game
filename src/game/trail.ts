import { segmentIntersection, polygonArea, distPointSegment2 } from '../core/geometry';
import type { Vec } from '../core/math';
import { TUNING } from './config';
import type { TrailPoint } from './types';

export interface LoopResult {
  poly: Vec[];
  area: number;
  x: number;
  y: number;
}

/**
 * The light trail behind the player. Points are spaced at least `pointSpacing` apart and are
 * limited by both a maximum total length and a maximum age. Whenever the newest segment
 * crosses an older one, the enclosed polygon is returned as a closed loop.
 */
export class Trail {
  points: TrailPoint[] = [];
  /** Length of segment i → i+1 is stored at index i. */
  private segLen: number[] = [];
  totalLength = 0;

  constructor(
    public maxLength: number = TUNING.trail.length,
    public life: number = TUNING.trail.life,
  ) {}

  reset(x?: number, y?: number, t = 0): void {
    this.points.length = 0;
    this.segLen.length = 0;
    this.totalLength = 0;
    if (x !== undefined && y !== undefined) this.points.push({ x, y, t });
  }

  get head(): TrailPoint | undefined {
    return this.points[this.points.length - 1];
  }

  /**
   * Feeds the current player position. Returns a loop if the new segment closed one.
   * Points are only appended once the player has moved far enough.
   */
  update(x: number, y: number, now: number): LoopResult | null {
    let loop: LoopResult | null = null;
    const head = this.head;
    if (!head) {
      this.points.push({ x, y, t: now });
    } else {
      const d = Math.hypot(x - head.x, y - head.y);
      if (d >= TUNING.trail.pointSpacing) {
        loop = this.detectLoop(head.x, head.y, x, y);
        if (loop) {
          // Restart the trail from the crossing point so consecutive loops stay readable.
          this.reset(loop.x, loop.y, now);
          this.push(x, y, now);
        } else {
          this.push(x, y, now);
        }
      }
    }
    this.expire(now);
    return loop;
  }

  private push(x: number, y: number, t: number): void {
    const head = this.head;
    if (head) {
      const l = Math.hypot(x - head.x, y - head.y);
      this.segLen.push(l);
      this.totalLength += l;
    }
    this.points.push({ x, y, t });
  }

  private dropTail(): void {
    this.points.shift();
    const l = this.segLen.shift();
    if (l !== undefined) this.totalLength -= l;
  }

  private expire(now: number): void {
    while (this.points.length > 1 && now - this.points[0].t > this.life) this.dropTail();
    while (this.points.length > 2 && this.totalLength > this.maxLength) this.dropTail();
    if (this.totalLength < 0) this.totalLength = 0;
  }

  /** Tests the prospective segment (ax,ay)→(bx,by) against all older segments. */
  private detectLoop(ax: number, ay: number, bx: number, by: number): LoopResult | null {
    const pts = this.points;
    // Newest existing segment is (n-2 → n-1); the prospective one starts at n-1. Skip its neighbours.
    const last = pts.length - 1 - TUNING.trail.skipSegments;
    for (let i = 0; i < last; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const hit = segmentIntersection(p.x, p.y, q.x, q.y, ax, ay, bx, by);
      if (!hit) continue;
      const poly: Vec[] = [{ x: hit.x, y: hit.y }];
      for (let k = i + 1; k < pts.length; k++) poly.push({ x: pts[k].x, y: pts[k].y });
      const area = polygonArea(poly);
      if (area < TUNING.trail.minLoopArea) continue;
      return { poly, area, x: hit.x, y: hit.y };
    }
    return null;
  }

  /**
   * Cuts the trail where a circle touches it: everything older than the touched segment disappears.
   * Returns the cut position or null.
   */
  cutByCircle(cx: number, cy: number, r: number): Vec | null {
    const pts = this.points;
    const r2 = r * r;
    for (let i = pts.length - 2; i >= 0; i--) {
      const a = pts[i];
      const b = pts[i + 1];
      if (distPointSegment2(cx, cy, a.x, a.y, b.x, b.y) <= r2) {
        this.cutAt(i + 1);
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    }
    return null;
  }

  /** Cuts the trail where it crosses segment AB. */
  cutBySegment(ax: number, ay: number, bx: number, by: number): Vec | null {
    const pts = this.points;
    for (let i = pts.length - 2; i >= 0; i--) {
      const p = pts[i];
      const q = pts[i + 1];
      const hit = segmentIntersection(p.x, p.y, q.x, q.y, ax, ay, bx, by);
      if (hit) {
        this.cutAt(i + 1);
        return { x: hit.x, y: hit.y };
      }
    }
    return null;
  }

  /** Removes all points before index `keepFrom`. */
  private cutAt(keepFrom: number): void {
    for (let k = 0; k < keepFrom && this.points.length > 1; k++) this.dropTail();
  }

  /** True if a circle touches any trail segment (used by the ember trail). */
  touchesCircle(cx: number, cy: number, r: number): boolean {
    const pts = this.points;
    const r2 = r * r;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (distPointSegment2(cx, cy, a.x, a.y, b.x, b.y) <= r2) return true;
    }
    return false;
  }
}
