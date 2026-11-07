import { describe, expect, it } from 'vitest';

import type { GeoFeature, GeoFeatureType, GeoGeometry } from '../geodata/types';
import { createBrowseCameraPlan, createFeatureCameraPlan, resolveHudPadding } from '../map/framing';

function feature(
  featureType: GeoFeatureType,
  geometry: GeoGeometry,
  bbox: [number, number, number, number],
): GeoFeature {
  return {
    id: `test-${featureType}`,
    source: 'custom',
    sourceVersion: 'test-1',
    featureType,
    name: `Test ${featureType}`,
    localizedNames: { en: `Test ${featureType}` },
    aliases: [],
    geometry,
    centroid: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    bbox,
    parentIds: [],
    recommendedMinZoom: 1,
    recommendedMaxZoom: 18,
  };
}

describe('map camera framing', () => {
  const desktop = { viewport: { width: 1440, height: 900 } };

  it('fits country polygons with context instead of replacing them with a point', () => {
    const korea = feature(
      'country',
      {
        type: 'Polygon',
        coordinates: [[[126, 34], [130, 34], [130, 38], [126, 38], [126, 34]]],
      },
      [126, 34, 130, 38],
    );
    const plan = createFeatureCameraPlan(korea, 'question', desktop);

    expect(plan.method).toBe('fitBounds');
    if (plan.method !== 'fitBounds') return;
    expect(plan.bounds[0]).toBeLessThan(126);
    expect(plan.bounds[2]).toBeGreaterThan(130);
    expect(plan.maxZoom).toBeLessThanOrEqual(6.2);
  });

  it('fits a river LineString to its real extent', () => {
    const river = feature(
      'river',
      { type: 'LineString', coordinates: [[126.8, 37.5], [127.2, 37.55], [127.5, 37.6]] },
      [126.8, 37.5, 127.5, 37.6],
    );
    expect(createFeatureCameraPlan(river, 'question', desktop).method).toBe('fitBounds');
  });

  it('flies to a station at a close but bounded zoom', () => {
    const station = feature('station', { type: 'Point', coordinates: [126.97, 37.55] }, [126.97, 37.55, 126.97, 37.55]);
    const plan = createFeatureCameraPlan(station, 'question', desktop);

    expect(plan.method).toBe('flyTo');
    if (plan.method !== 'flyTo') return;
    expect(plan.zoom).toBe(16);
    expect(plan.pitch).toBeGreaterThanOrEqual(45);
  });

  it('reserves a larger bottom HUD safe area on mobile', () => {
    const mobile = resolveHudPadding({ width: 390, height: 844 });
    expect(mobile.bottom).toBeGreaterThan(mobile.top);
    expect(mobile.left).toBeGreaterThanOrEqual(24);
  });

  it('uses a whole-world ease plan for browse without a selected feature', () => {
    expect(createBrowseCameraPlan({ viewport: { width: 1440, height: 900 } })).toMatchObject({
      method: 'easeTo',
      center: [0, 18],
      pitch: 0,
    });
  });
});

describe('features across the antimeridian', () => {
  const desktop = { viewport: { width: 1440, height: 900 } };
  const box = (west: number, south: number, east: number, north: number): [number, number][][] => [[
    [west, south], [east, south], [east, north], [west, north], [west, south],
  ]];

  it('frames the longitudes the feature occupies instead of the opposite hemisphere', () => {
    const acrossAntimeridian = feature(
      'country',
      { type: 'MultiPolygon', coordinates: [box(166, -47, 178, -34), box(-178, -44, -176, -43)] },
      [-178, -47, 178, -34],
    );
    const plan = createFeatureCameraPlan(acrossAntimeridian, 'question', desktop);
    if (plan.method !== 'fitBounds') throw new Error('expected fitBounds');
    const [west, , east] = plan.bounds;
    expect(west).toBeGreaterThan(160);
    expect(west).toBeLessThan(166);
    expect(east).toBeGreaterThan(184);
    expect(east).toBeLessThan(190);
  });

  it('keeps the bbox when the feature really circles the globe', () => {
    const ring: [number, number][] = [-180, -120, -60, 0, 60, 120, 180].map((longitude) => [longitude, -70]);
    const everywhere = feature(
      'continent',
      { type: 'Polygon', coordinates: [[...ring, [180, -85], [-180, -85], [-180, -70]]] },
      [-180, -85, 180, -70],
    );
    const plan = createFeatureCameraPlan(everywhere, 'question', desktop);
    if (plan.method !== 'fitBounds') throw new Error('expected fitBounds');
    expect(plan.bounds[0]).toBe(-180);
    expect(plan.bounds[2]).toBe(180);
  });
});
