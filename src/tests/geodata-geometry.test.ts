import { describe, expect, it } from 'vitest';

import {
  calculateBoundingBox,
  calculateCentroid,
} from '../geodata/geometry';

describe('geodata geometry calculations', () => {
  it('calculates a Polygon bbox and centroid from the full boundary', () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [126, 37] as [number, number],
          [128, 37] as [number, number],
          [128, 39] as [number, number],
          [126, 39] as [number, number],
          [126, 37] as [number, number],
        ],
      ],
    };

    expect(calculateBoundingBox(geometry)).toEqual([126, 37, 128, 39]);
    expect(calculateCentroid(geometry)).toEqual([127, 38]);
  });

  it('calculates a LineString bbox and length-weighted centroid', () => {
    const geometry = {
      type: 'LineString' as const,
      coordinates: [
        [0, 0] as [number, number],
        [2, 0] as [number, number],
        [2, 2] as [number, number],
      ],
    };

    expect(calculateBoundingBox(geometry)).toEqual([0, 0, 2, 2]);
    expect(calculateCentroid(geometry)).toEqual([1.5, 0.5]);
  });
});
