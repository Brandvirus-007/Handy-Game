import type { Vec } from './math';

export interface Hit {
  x: number;
  y: number;
  /** Parameter along the first segment (0..1). */
  t: number;
  /** Parameter along the second segment (0..1). */
  u: number;
}

/** Proper intersection of segments AB and CD (endpoints count). Returns null if parallel / disjoint. */
export function segmentIntersection(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): Hit | null {
  const rX = bx - ax;
  const rY = by - ay;
  const sX = dx - cx;
  const sY = dy - cy;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-9) return null;
  const qpX = cx - ax;
  const qpY = cy - ay;
  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + t * rX, y: ay + t * rY, t, u };
}

/** Even-odd rule point-in-polygon test. */
export function pointInPolygon(x: number, y: number, poly: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Signed area (shoelace). Positive = counter-clockwise in a y-up system. */
export function signedArea(poly: readonly Vec[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return a / 2;
}

export const polygonArea = (poly: readonly Vec[]): number => Math.abs(signedArea(poly));

export function polygonCentroid(poly: readonly Vec[]): Vec {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  const n = poly.length || 1;
  return { x: x / n, y: y / n };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function polygonBounds(poly: readonly Vec[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export const inBounds = (b: Bounds, x: number, y: number, pad = 0): boolean =>
  x >= b.minX - pad && x <= b.maxX + pad && y >= b.minY - pad && y <= b.maxY + pad;

/** Squared distance from point P to segment AB. */
export function distPointSegment2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + abx * t - px;
  const cy = ay + aby * t - py;
  return cx * cx + cy * cy;
}

export const segmentCircle = (
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number,
): boolean => distPointSegment2(cx, cy, ax, ay, bx, by) <= r * r;

/** Perimeter length of a closed polygon. */
export function polygonPerimeter(poly: readonly Vec[]): number {
  let l = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    l += Math.hypot(poly[i].x - poly[j].x, poly[i].y - poly[j].y);
  }
  return l;
}
