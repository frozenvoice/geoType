import { beforeEach, describe, expect, it } from 'vitest';

import type { GeoFeature, GeoFeatureType } from '../geodata/types';
import {
  filterEligibleFeatures,
  getEligibleFeatureTypes,
  getFeatureDisplayName,
  getFeatureTypeLabel,
  selectionStore,
} from '../selection';

function feature(
  id: string,
  featureType: GeoFeatureType,
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
    parentIds: [],
    recommendedMinZoom: 0,
    recommendedMaxZoom: 24,
    ...overrides,
  };
}

describe('geography selection', () => {
  beforeEach(() => {
    selectionStore.getState().resetSelection();
  });

  it('keeps map and tree consumers synchronized through one store', () => {
    const world = feature('world', 'continent', {
      localizedNames: { ko: '세계' },
    });
    const korea = feature('KR', 'country', {
      localizedNames: { ko: '대한민국' },
      countryCode: 'KR',
      parentIds: ['world'],
    });
    const seoul = feature('KR-11', 'admin1', {
      localizedNames: { ko: '서울특별시' },
      countryCode: 'KR',
      parentIds: ['KR'],
    });

    selectionStore.getState().drillDown(korea, [world]);
    selectionStore.getState().drillDown(seoul);

    expect(selectionStore.getState().selectedFeature?.id).toBe('KR-11');
    expect(selectionStore.getState().breadcrumbs.map(({ label }) => label)).toEqual([
      '세계',
      '대한민국',
      '서울특별시',
    ]);

    selectionStore.getState().goBack();
    expect(selectionStore.getState().selectedFeature?.id).toBe('KR');

    selectionStore.getState().navigateToBreadcrumb('world');
    expect(selectionStore.getState().navigationPath.map(({ id }) => id)).toEqual(['world']);

    selectionStore.getState().setHoveredFeature(korea);
    selectionStore.getState().resetSelection();
    expect(selectionStore.getState()).toMatchObject({
      selectedFeature: null,
      hoveredFeature: null,
      navigationPath: [],
      breadcrumbs: [],
    });
  });

  it('normalizes a supplied breadcrumb path and removes duplicate features', () => {
    const world = feature('world', 'continent');
    const korea = feature('KR', 'country');

    selectionStore.getState().replaceNavigationPath([world, korea, korea]);
    expect(selectionStore.getState().navigationPath.map(({ id }) => id)).toEqual([
      'world',
      'KR',
    ]);
  });

  it('tracks country selection and hover independently and clears both on reset', () => {
    const japan = feature('natural-earth:country:JP', 'country', {
      name: 'Japan',
      localizedNames: { ko: '일본', en: 'Japan' },
      aliases: ['JP', 'JPN'],
      countryCode: 'JP',
      countryCodeAlpha3: 'JPN',
    });

    selectionStore.getState().selectFeature(japan);
    expect(selectionStore.getState().selectedFeature).toBe(japan);
    expect(selectionStore.getState().hoveredFeature).toBeNull();

    selectionStore.getState().setHoveredFeature(japan);
    expect(selectionStore.getState().hoveredFeature).toBe(japan);

    selectionStore.getState().setHoveredFeature(null);
    expect(selectionStore.getState().selectedFeature).toBe(japan);
    expect(selectionStore.getState().hoveredFeature).toBeNull();

    selectionStore.getState().resetSelection();
    expect(selectionStore.getState()).toMatchObject({
      selectedFeature: null,
      hoveredFeature: null,
      navigationPath: [],
      breadcrumbs: [],
    });
  });

  it('supports an explicit country selection clear without altering hover state', () => {
    const korea = feature('natural-earth:country:KR', 'country', {
      localizedNames: { ko: '대한민국' },
      countryCode: 'KR',
    });

    selectionStore.getState().selectFeature(korea);
    selectionStore.getState().setHoveredFeature(korea);
    selectionStore.getState().selectFeature(null);

    expect(selectionStore.getState().selectedFeature).toBeNull();
    expect(selectionStore.getState().hoveredFeature).toBe(korea);
  });

  it('provides country-system-specific hierarchy labels and localized names', () => {
    expect(getFeatureTypeLabel('admin1', 'KR')).toBe('시·도 / 광역자치단체');
    expect(getFeatureTypeLabel('admin2', 'US')).toBe('카운티');
    expect(getFeatureTypeLabel('admin1', 'JP')).toBe('도도부현');
    expect(getFeatureTypeLabel('admin2', 'FR')).toBe('세부 행정구역');

    const seoul = feature('seoul', 'city', {
      name: 'Seoul',
      localizedNames: { en: 'Seoul', ko: '서울' },
    });
    expect(getFeatureDisplayName(seoul, 'ko-KR')).toBe('서울');
    expect(getFeatureDisplayName(seoul, 'fr')).toBe('서울');
  });

  it('changes selectable hierarchy levels with zoom', () => {
    expect(getEligibleFeatureTypes({ zoom: 2 })).toContain('country');
    expect(getEligibleFeatureTypes({ zoom: 2 })).not.toContain('admin1');
    expect(getEligibleFeatureTypes({ zoom: 4, parentFeatureType: 'country' })).toContain(
      'admin1',
    );
    expect(getEligibleFeatureTypes({ zoom: 10, parentFeatureType: 'city' })).toContain(
      'neighborhood',
    );
    expect(getEligibleFeatureTypes({ zoom: 14, parentFeatureType: 'neighborhood' })).toEqual(
      expect.arrayContaining(['station', 'landmark', 'poi']),
    );
  });

  it('considers catalog zoom bounds, geometry, importance, and hierarchy', () => {
    const ordinaryRegion = feature('ordinary', 'admin1', {
      importance: 0.3,
      recommendedMinZoom: 4,
      recommendedMaxZoom: 8,
      geometry: {
        type: 'Polygon',
        coordinates: [[[126, 37], [127, 37], [127, 38], [126, 37]]],
      },
      bbox: [126, 37, 127, 38],
    });
    const importantRegion = feature('important', 'admin1', {
      importance: 0.95,
      recommendedMinZoom: 4,
      recommendedMaxZoom: 8,
      geometry: {
        type: 'Polygon',
        coordinates: [[[120, 30], [130, 30], [130, 40], [120, 30]]],
      },
      bbox: [120, 30, 130, 40],
    });
    const city = feature('city', 'city', { importance: 0.9 });

    expect(filterEligibleFeatures([ordinaryRegion, importantRegion], { zoom: 2 })).toEqual([
      importantRegion,
    ]);
    expect(
      filterEligibleFeatures([importantRegion, city], {
        zoom: 4,
        parentFeatureType: 'continent',
      }),
    ).toEqual([]);
    expect(
      filterEligibleFeatures([importantRegion], { zoom: 4, minImportance: 0.99 }),
    ).toEqual([]);
  });
});
