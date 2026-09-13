import { describe, expect, it } from 'vitest';

import { evaluateMapReadiness } from '../map/readiness';

describe('map readiness gate', () => {
  const readySnapshot = {
    mapIdle: true,
    mapMoving: false,
    sourceLoaded: true,
    targetRendered: true,
    requiredLayerIds: ['target-fill', 'target-outline'],
    availableLayerIds: ['base', 'target-fill', 'target-outline'],
  };

  it('waits for idle, source load, and every required layer', () => {
    expect(evaluateMapReadiness(readySnapshot).ready).toBe(true);
    expect(evaluateMapReadiness({ ...readySnapshot, mapMoving: true }).ready).toBe(false);
    expect(evaluateMapReadiness({ ...readySnapshot, sourceLoaded: false }).ready).toBe(false);
    expect(evaluateMapReadiness({ ...readySnapshot, targetRendered: false }).ready).toBe(false);
    expect(
      evaluateMapReadiness({ ...readySnapshot, availableLayerIds: ['base', 'target-fill'] }).ready,
    ).toBe(false);
  });
});
