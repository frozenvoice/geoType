import { describe, expect, it } from 'vitest';

import {
  BASE_MAP_QUALITY_CRITERIA,
  evaluateMapQualityReview,
} from '../map/qualityPolicy';

function passingEnvironment() {
  return Object.fromEntries(
    BASE_MAP_QUALITY_CRITERIA.map((criterion) => [criterion.environmentKey, 'pass']),
  );
}

describe('map quality review policy', () => {
  it('cannot pass through the legacy single approval boolean', () => {
    const review = evaluateMapQualityReview({ MAP_QUALITY_APPROVED: 'true' });

    expect(review.allPassed).toBe(false);
    expect(review.pending).toHaveLength(BASE_MAP_QUALITY_CRITERIA.length);
  });

  it('requires every base visual criterion to pass independently', () => {
    const environment = passingEnvironment();
    environment.MAP_QUALITY_MOBILE_RESULT = 'fail';
    const review = evaluateMapQualityReview(environment);

    expect(review.allPassed).toBe(false);
    expect(review.anyFailed).toBe(true);
    expect(review.criteria.find((criterion) => criterion.id === 'mobile')?.status).toBe('FAIL');
  });

  it('passes review policy only when every required result is explicit', () => {
    const review = evaluateMapQualityReview(passingEnvironment());

    expect(review.allPassed).toBe(true);
    expect(review.anyFailed).toBe(false);
    expect(review.pending).toEqual([]);
  });

  it('adds terrain and building reviews only when those capabilities are active', () => {
    const environment = {
      ...passingEnvironment(),
      MAP_QUALITY_TERRAIN_RESULT: 'pass',
    };
    const review = evaluateMapQualityReview(environment, {
      terrainRequired: true,
      buildingsRequired: true,
    });

    expect(review.allPassed).toBe(false);
    expect(review.pending).toEqual(['MAP_QUALITY_BUILDINGS_RESULT']);
    expect(review.criteria.find((criterion) => criterion.id === 'terrain')?.status).toBe('PASS');
  });
});
