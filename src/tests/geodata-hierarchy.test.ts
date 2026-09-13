import { describe, expect, it } from 'vitest';

import {
  buildHierarchyIndex,
  getAncestors,
  getBreadcrumb,
  getChildren,
  getDescendants,
  validateHierarchy,
} from '../geodata/hierarchy';
import type { GeoFeature, GeoFeatureType } from '../geodata/types';

function node(id: string, featureType: GeoFeatureType, parentIds: string[]): GeoFeature {
  return {
    id,
    source: 'custom',
    sourceVersion: 'test-v1',
    featureType,
    name: id,
    localizedNames: {},
    aliases: [],
    geometry: { type: 'Point', coordinates: [127, 37] },
    centroid: [127, 37],
    bbox: [127, 37, 127, 37],
    parentIds,
    recommendedMinZoom: 0,
    recommendedMaxZoom: 20,
  };
}

describe('geodata hierarchy', () => {
  const features = [
    node('asia', 'continent', []),
    node('kr', 'country', ['asia']),
    node('seoul', 'admin1', ['kr']),
    node('jongno', 'admin2', ['seoul']),
    node('station', 'station', ['jongno', 'seoul']),
  ];

  it('supports parent/child traversal and canonical breadcrumbs', () => {
    const index = buildHierarchyIndex(features);

    expect(getChildren(index, 'seoul').map((feature) => feature.id)).toEqual([
      'jongno',
      'station',
    ]);
    expect(getAncestors(index, 'station').map((feature) => feature.id)).toEqual([
      'jongno',
      'seoul',
      'kr',
      'asia',
    ]);
    expect(getBreadcrumb(index, 'station').map((feature) => feature.id)).toEqual([
      'asia',
      'kr',
      'seoul',
      'jongno',
      'station',
    ]);
    expect(getDescendants(index, 'kr').map((feature) => feature.id)).toEqual([
      'seoul',
      'jongno',
      'station',
    ]);
  });

  it('reports missing parents, duplicate ids, and cycles', () => {
    const invalid = [
      node('cycle-one', 'country', ['cycle-two']),
      node('cycle-two', 'country', ['cycle-one']),
      node('duplicate', 'country', []),
      node('duplicate', 'country', ['missing']),
    ];

    const codes = validateHierarchy(invalid).map((issue) => issue.code);
    expect(codes).toContain('duplicate-id');
    expect(codes).toContain('missing-parent');
    expect(codes).toContain('cycle');
  });
});
