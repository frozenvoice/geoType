import { describe, expect, it } from 'vitest';

import type { GeoFeature, GeoFeatureType } from '../geodata/types';
import {
  GameScopeBuilder,
  buildGameScope,
  filterFeaturesForScope,
  gameScopeSchema,
  selectGameScopeFeatures,
} from '../game/scope';

function feature(
  id: string,
  featureType: GeoFeatureType,
  parentIds: string[],
  overrides: Partial<GeoFeature> = {},
): GeoFeature {
  return {
    id,
    source: 'custom',
    sourceVersion: 'test-1',
    featureType,
    name: id,
    localizedNames: { ko: id },
    aliases: [],
    geometry: { type: 'Point', coordinates: [127, 37.5] },
    centroid: [127, 37.5],
    bbox: [127, 37.5, 127, 37.5],
    parentIds,
    recommendedMinZoom: 0,
    recommendedMaxZoom: 24,
    ...overrides,
  };
}

const world = feature('world', 'continent', []);
const korea = feature('KR', 'country', ['world'], { population: 51_000_000 });
const seoul = feature('KR-11', 'admin1', ['KR'], {
  population: 9_300_000,
  importance: 0.99,
});
const gangnam = feature('KR-11-gangnam', 'admin2', ['KR-11'], {
  population: 560_000,
  importance: 0.86,
});
const smallDistrict = feature('KR-11-small', 'admin2', ['KR-11'], {
  population: 80_000,
  importance: 0.5,
});
const seoulStation = feature('seoul-station', 'station', ['KR-11'], {
  importance: 0.93,
});
const bukhansan = feature('bukhansan', 'mountain', ['KR-11'], {
  importance: 0.9,
});
const hanRiver = feature('han-river', 'river', ['KR-11'], {
  importance: 0.95,
});
const busan = feature('KR-26', 'admin1', ['KR'], {
  population: 3_300_000,
  importance: 0.94,
});
const california = feature('US-CA', 'admin1', ['US'], {
  population: 39_000_000,
  importance: 0.98,
});

const catalog = [
  world,
  korea,
  seoul,
  gangnam,
  smallDistrict,
  seoulStation,
  bukhansan,
  hanRiver,
  busan,
  california,
];

describe('dynamic game scope', () => {
  it('validates, defaults, normalizes, and deduplicates a scope', () => {
    const scope = buildGameScope({
      rootFeatureId: ' KR ',
      includedFeatureTypes: ['admin1', 'admin1'],
      questionCount: 5,
    });

    expect(scope).toMatchObject({
      rootFeatureId: 'KR',
      includedFeatureTypes: ['admin1'],
      includeDescendants: true,
      includeNaturalFeatures: true,
      includeLandmarks: true,
    });
    expect(gameScopeSchema.safeParse({ ...scope, questionCount: 0 }).success).toBe(false);
  });

  it('builds the same configuration through the fluent builder', () => {
    const scope = new GameScopeBuilder('KR-11')
      .includeTypes('admin2', 'station', 'mountain')
      .includeDescendants()
      .questions(8)
      .seededBy('서울-주말')
      .withMinimumImportance(0.5)
      .withNaturalFeatures(false)
      .withLandmarks(true)
      .build();

    expect(scope).toMatchObject({
      rootFeatureId: 'KR-11',
      questionCount: 8,
      seed: '서울-주말',
      includeNaturalFeatures: false,
      includeLandmarks: true,
    });
  });

  it('selects descendants transitively and excludes other hierarchy branches', () => {
    const selected = filterFeaturesForScope(catalog, {
      rootFeatureId: 'KR',
      includedFeatureTypes: ['admin1', 'admin2'],
      includeDescendants: true,
      questionCount: 'all',
    });

    expect(selected.map(({ id }) => id)).toEqual([
      'KR-11',
      'KR-11-gangnam',
      'KR-11-small',
      'KR-26',
    ]);
    expect(selected).not.toContain(california);
  });

  it('supports population, importance, natural feature, and landmark filters', () => {
    const selected = filterFeaturesForScope(catalog, {
      rootFeatureId: 'KR-11',
      includedFeatureTypes: ['admin2', 'station', 'mountain', 'river'],
      includeDescendants: true,
      questionCount: 'all',
      minPopulation: 100_000,
      minImportance: 0.8,
      includeNaturalFeatures: false,
      includeLandmarks: true,
    });

    expect(selected).toEqual([gangnam, seoulStation]);

    const noLandmarks = filterFeaturesForScope(catalog, {
      rootFeatureId: 'KR-11',
      includedFeatureTypes: ['station', 'mountain', 'river'],
      includeDescendants: true,
      questionCount: 'all',
      includeNaturalFeatures: true,
      includeLandmarks: false,
    });
    expect(noLandmarks).toEqual([bukhansan, hanRiver]);
  });

  it('can restrict a scope to the selected feature itself', () => {
    const selected = filterFeaturesForScope(catalog, {
      rootFeatureId: 'KR-11',
      includedFeatureTypes: ['admin1'],
      includeDescendants: false,
      questionCount: 'all',
    });
    expect(selected).toEqual([seoul]);
  });

  it('deduplicates features and produces stable seeded questions', () => {
    const scope = buildGameScope({
      rootFeatureId: 'KR',
      includedFeatureTypes: ['admin1', 'admin2'],
      includeDescendants: true,
      questionCount: 3,
      seed: 'same-seed',
    });

    const first = selectGameScopeFeatures([...catalog, gangnam], scope);
    const second = selectGameScopeFeatures([...catalog].reverse(), scope);
    const third = selectGameScopeFeatures(catalog, { ...scope, seed: 'different-seed' });

    expect(first.map(({ id }) => id)).toEqual(second.map(({ id }) => id));
    expect(new Set(first.map(({ id }) => id)).size).toBe(3);
    expect(first.map(({ id }) => id)).not.toEqual(third.map(({ id }) => id));
  });
});
