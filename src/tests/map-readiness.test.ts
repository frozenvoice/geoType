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

  it('never leaves a question locked once the deadline has passed', () => {
    const lostSignals = {
      ...readySnapshot,
      mapIdle: false,
      sourceLoaded: false,
      targetRendered: false,
    };
    expect(evaluateMapReadiness(lostSignals).ready).toBe(false);
    expect(evaluateMapReadiness({ ...lostSignals, deadlineExpired: true }).ready).toBe(true);
  });

  it('still waits for the camera and the layers after the deadline', () => {
    const expired = { ...readySnapshot, deadlineExpired: true };
    expect(evaluateMapReadiness({ ...expired, mapMoving: true }).ready).toBe(false);
    expect(evaluateMapReadiness({ ...expired, availableLayerIds: ['base'] }).ready).toBe(false);
  });
});
