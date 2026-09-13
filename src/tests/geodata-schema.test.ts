import { describe, expect, it } from 'vitest';

import { GeoDataManifestSchema, GeoFeatureSchema } from '../geodata/schemas';
import type { GeoFeature } from '../geodata/types';

function validFeature(): GeoFeature {
  return {
    id: 'custom:station:test',
    source: 'custom',
    sourceVersion: 'test-v1',
    featureType: 'station',
    name: 'Test Station',
    localizedNames: { ko: '테스트역' },
    aliases: ['Test rail station'],
    geometry: { type: 'Point', coordinates: [127, 37.5] },
    centroid: [127, 37.5],
    bbox: [127, 37.5, 127, 37.5],
    parentIds: [],
    countryCode: 'KR',
    importance: 0.5,
    recommendedMinZoom: 12,
    recommendedMaxZoom: 18,
  };
}

describe('GeoFeature schema', () => {
  it('accepts a spatially consistent feature', () => {
    expect(GeoFeatureSchema.parse(validFeature()).id).toBe('custom:station:test');
  });

  it('rejects a bbox that does not cover the geometry', () => {
    const feature = validFeature();
    feature.bbox = [126, 37, 128, 38];

    const result = GeoFeatureSchema.safeParse(feature);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'bbox')).toBe(true);
    }
  });

  it('rejects an unclosed Polygon and non-NFC aliases', () => {
    const feature = validFeature();
    feature.featureType = 'admin2';
    feature.aliases = ['서울'];
    feature.geometry = {
      type: 'Polygon',
      coordinates: [[[126, 37], [127, 37], [127, 38], [126, 38]]],
    };
    feature.bbox = [126, 37, 127, 38];
    feature.centroid = [126.5, 37.5];

    const result = GeoFeatureSchema.safeParse(feature);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          'Polygon rings must be closed.',
          'Text must be Unicode NFC normalized.',
        ]),
      );
    }
  });

  it('rejects cyclic shard dependencies before lazy loading', () => {
    const descriptor = (id: string, dependsOn: string[]) => ({
      id,
      path: `/geodata/${id}.json`,
      checksum: `sha256:${'a'.repeat(64)}`,
      byteSize: 0,
      featureCount: 0,
      compression: 'none' as const,
      sourceVersion: 'test-v1',
      featureTypes: ['country' as const],
      scopeFeatureIds: [],
      countryCodes: [],
      dependsOn,
    });
    const result = GeoDataManifestSchema.safeParse({
      schemaVersion: 1,
      catalogVersion: 'test-v1',
      generatedAt: '2026-07-19T00:00:00.000Z',
      scopeLabel: 'test',
      scopeComplete: false,
      disclaimer: 'Test only.',
      sourceVersions: { custom: 'test-v1' },
      totals: { shardCount: 2, featureCount: 0, byteSize: 0 },
      shards: [descriptor('one', ['two']), descriptor('two', ['one'])],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('dependency cycle'))).toBe(true);
    }
  });
});
