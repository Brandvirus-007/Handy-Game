import { describe, expect, it } from 'vitest';
import {
  segmentIntersection,
  pointInPolygon,
  polygonArea,
  distPointSegment2,
  polygonBounds,
} from '../src/core/geometry';

describe('geometry', () => {
  it('finds crossing segments', () => {
    const hit = segmentIntersection(0, 0, 10, 10, 0, 10, 10, 0);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(5);
    expect(hit!.y).toBeCloseTo(5);
  });

  it('rejects parallel and disjoint segments', () => {
    expect(segmentIntersection(0, 0, 10, 0, 0, 1, 10, 1)).toBeNull();
    expect(segmentIntersection(0, 0, 1, 1, 5, 0, 6, -3)).toBeNull();
  });

  it('point in polygon (square, concave)', () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
    const u = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 20, y: 30 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }];
    expect(pointInPolygon(15, 20, u)).toBe(false);
    expect(pointInPolygon(5, 20, u)).toBe(true);
  });

  it('area and bounds', () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(polygonArea(sq)).toBeCloseTo(100);
    expect(polygonBounds(sq)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it('distance point to segment', () => {
    expect(distPointSegment2(5, 3, 0, 0, 10, 0)).toBeCloseTo(9);
    expect(distPointSegment2(-3, 4, 0, 0, 10, 0)).toBeCloseTo(25);
  });
});
