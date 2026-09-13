import { describe, expect, it } from 'vitest';
import { connectJourneyPoints } from '../map/journey';

describe('visited route', () => {
  it('connects nearby locations directly', () => {
    expect(connectJourneyPoints([127, 37], [139, 35])).toEqual([[[127, 37], [139, 35]]]);
  });
  it('splits an eastward Pacific crossing at the date line', () => {
    expect(connectJourneyPoints([170, 30], [-170, 40])).toEqual([
      [[170, 30], [180, 35]], [[-180, 35], [-170, 40]],
    ]);
  });
  it('splits westward crossings without a world-spanning line', () => {
    expect(connectJourneyPoints([-170, 40], [170, 30])).toEqual([
      [[-170, 40], [-180, 35]], [[180, 35], [170, 30]],
    ]);
  });
});
