import { describe, expect, it } from 'vitest';

import type { GeoFeature } from '../geodata/types';
import {
  createCatalogFeatureCollection,
  createCatalogLayerSpecifications,
  createCountryFeatureCollection,
  createCountryLayerSpecifications,
  createTargetFeatureCollection,
  createTargetLabelCollection,
  createTargetLayerSpecifications,
  createTargetNameExclusionFilter,
  defaultLabelHidingStrategy,
  deriveInteractiveLayerIds,
  MAP_LAYER_IDS,
  MAP_SOURCE_IDS,
  shouldShowTargetLocator,
  targetOutlineProbe,
} from '../map/layers';

const district: GeoFeature = {
  id: 'kr-11-gangnam',
  source: 'custom',
  sourceVersion: 'test-1',
  featureType: 'admin2',
  name: '강남구',
  localizedNames: { ko: '강남구', en: 'Gangnam-gu' },
  aliases: ['강남'],
  geometry: {
    type: 'Polygon',
    coordinates: [[[127, 37.45], [127.12, 37.45], [127.12, 37.55], [127, 37.55], [127, 37.45]]],
  },
  centroid: [127.06, 37.5],
  bbox: [127, 37.45, 127.12, 37.55],
  parentIds: ['kr-11'],
  countryCode: 'KR',
  recommendedMinZoom: 8,
  recommendedMaxZoom: 13,
};

const japan: GeoFeature = {
  id: 'natural-earth:country:JP',
  source: 'natural-earth',
  sourceVersion: 'natural-earth-admin0-test',
  featureType: 'country',
  name: 'Japan',
  localizedNames: { ko: '일본', en: 'Japan', ja: '日本' },
  aliases: ['JP', 'JPN'],
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [[[129, 31], [146, 31], [146, 46], [129, 46], [129, 31]]],
    ],
  },
  centroid: [138, 37],
  bbox: [129, 31, 146, 46],
  parentIds: ['continent:asia'],
  countryCode: 'JP',
  countryCodeAlpha3: 'JPN',
  continentId: 'asia',
  recommendedMinZoom: 0,
  recommendedMaxZoom: 8,
};

describe('map geometry and label layers', () => {
  it('reveals one label at the centroid instead of repeating it on every island', () => {
    const collection = createTargetLabelCollection(japan, '日本');
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.geometry).toEqual({ type: 'Point', coordinates: japan.centroid });
    expect(collection.features[0]?.properties.name).toBe('日本');
  });
  it('uses the exact application-owned country source and layer IDs', () => {
    expect(MAP_SOURCE_IDS.countries).toBe('game-countries-source');
    expect({
      hit: MAP_LAYER_IDS.countryHit,
      hover: MAP_LAYER_IDS.countryHover,
      selected: MAP_LAYER_IDS.countrySelected,
    }).toEqual({
      hit: 'game-countries-hit',
      hover: 'game-countries-hover',
      selected: 'game-countries-selected',
    });
  });

  it('serializes only canonical countries with stable IDs and ISO codes', () => {
    const collection = createCountryFeatureCollection([district, japan]);

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]).toMatchObject({
      id: japan.id,
      geometry: { type: 'MultiPolygon' },
      properties: {
        id: japan.id,
        featureId: japan.id,
        name: '일본',
        nameEn: 'Japan',
        countryCode: 'JP',
        isoAlpha3: 'JPN',
      },
    });
  });

  it('creates dedicated hit, hover, and selected country layers on one source', () => {
    const layers = createCountryLayerSpecifications(japan.id);
    const hit = layers.find((layer) => layer.id === MAP_LAYER_IDS.countryHit);
    const hover = layers.find((layer) => layer.id === MAP_LAYER_IDS.countryHover);
    const selected = layers.find((layer) => layer.id === MAP_LAYER_IDS.countrySelected);

    expect(layers).toHaveLength(3);
    expect(layers.every((layer) => layer.source === MAP_SOURCE_IDS.countries)).toBe(true);
    expect(hit).toMatchObject({
      type: 'fill',
    });
    expect(typeof hit?.paint?.['fill-color']).toBe('string');
    expect(typeof hit?.paint?.['fill-opacity']).toBe('number');
    expect(Number(hit?.paint?.['fill-opacity'])).toBeGreaterThan(0);
    expect(Number(hit?.paint?.['fill-opacity'])).toBeLessThanOrEqual(0.01);
    expect(hover).toMatchObject({
      type: 'line',
      filter: ['==', ['get', 'id'], '__geotype:no-match__'],
    });
    expect(typeof hover?.paint?.['line-color']).toBe('string');
    expect(typeof hover?.paint?.['line-width']).toBe('number');
    expect(selected).toMatchObject({
      type: 'fill',
      filter: ['==', ['get', 'id'], japan.id],
    });
    expect(typeof selected?.paint?.['fill-color']).toBe('string');
    expect(typeof selected?.paint?.['fill-opacity']).toBe('number');
    expect(typeof selected?.paint?.['fill-outline-color']).toBe('string');
  });

  it('starts country hover and selection layers with empty filters when unselected', () => {
    const layers = createCountryLayerSpecifications(null);
    expect(layers.find((layer) => layer.id === MAP_LAYER_IDS.countryHover)?.filter).toEqual([
      '==',
      ['get', 'id'],
      '__geotype:no-match__',
    ]);
    expect(layers.find((layer) => layer.id === MAP_LAYER_IDS.countrySelected)?.filter).toEqual([
      '==',
      ['get', 'id'],
      '__geotype:no-match__',
    ]);
  });

  it('keeps the canonical polygon in question GeoJSON and removes its name', () => {
    const collection = createTargetFeatureCollection(district, 'question');
    expect(collection.features[0]?.geometry.type).toBe('Polygon');
    expect(collection.features[0]?.properties).not.toHaveProperty('name');
  });

  it('restores the target name only in reveal mode', () => {
    expect(createTargetFeatureCollection(district, 'reveal').features[0]?.properties.name).toBe('강남구');
    expect(createTargetLayerSpecifications('reveal').some((layer) => layer.id === MAP_LAYER_IDS.targetLabel)).toBe(true);
    expect(createTargetLayerSpecifications('question').some((layer) => layer.id === MAP_LAYER_IDS.targetLabel)).toBe(false);
  });

  it('hides only the target catalog name in question mode', () => {
    const collection = createCatalogFeatureCollection([district], 'question', district.id);
    expect(collection.features[0]?.properties).not.toHaveProperty('name');
    expect(collection.features[0]?.properties.featureId).toBe(district.id);
  });

  it('keeps catalog geometry interactive in the test provider', () => {
    const layers = createCatalogLayerSpecifications('browse', 'normal');
    expect(layers.map((layer) => layer.id)).toEqual(
      expect.arrayContaining([
        MAP_LAYER_IDS.catalogFill,
        MAP_LAYER_IDS.catalogLine,
        MAP_LAYER_IDS.catalogPoint,
      ]),
    );
  });

  it('creates a target-name exclusion expression with localized names and aliases', () => {
    const rules = defaultLabelHidingStrategy({
      mode: 'question',
      difficulty: 'easy',
      target: district,
      styleLayers: [
        { id: 'place-label', type: 'symbol', layout: { 'text-field': ['get', 'name'] } },
      ],
    });
    expect(rules[0]).toMatchObject({ action: 'hide-target-name' });
    expect(rules[0]?.targetNames).toEqual(expect.arrayContaining(['강남구', 'Gangnam-gu', '강남']));
    expect(createTargetNameExclusionFilter(rules[0]?.targetNames ?? [])).not.toBeNull();
  });

  it('does not mix basemap countries or game-country overlays into generic selection', () => {
    expect(
      deriveInteractiveLayerIds([
        { id: MAP_LAYER_IDS.targetFill, type: 'fill', source: 'geotype-target' },
        { id: MAP_LAYER_IDS.countryHit, type: 'fill', source: MAP_SOURCE_IDS.countries },
        { id: 'basemap-country-boundary', type: 'fill', source: 'openmaptiles' },
        { id: 'basemap-country-label', type: 'symbol', source: 'openmaptiles' },
        { id: 'background', type: 'background' },
      ]),
    ).toEqual([]);
  });
});

describe('target locator', () => {
  const square = (longitude: number, latitude: number, size: number): [number, number][][] => [[
    [longitude, latitude],
    [longitude + size, latitude],
    [longitude + size, latitude + size],
    [longitude, latitude + size],
    [longitude, latitude],
  ]];
  const withGeometry = (geometry: GeoFeature['geometry']): GeoFeature => ({ ...district, geometry });

  it('marks an area target that is too small to see at the camera zoom', () => {
    const microstate = withGeometry({ type: 'Polygon', coordinates: square(12.44, 41.9, 0.01) });
    expect(shouldShowTargetLocator(microstate, 6.2)).toBe(true);
    expect(shouldShowTargetLocator(microstate, 16)).toBe(false);
  });

  it('judges an island nation by its largest part, not its overall spread', () => {
    const islands = withGeometry({
      type: 'MultiPolygon',
      coordinates: [square(-175, 0, 0.3), square(170, 1, 0.3)],
    });
    expect(shouldShowTargetLocator(islands, 0.8)).toBe(true);
  });

  it('leaves a visible country and non-area targets alone', () => {
    const country = withGeometry({ type: 'Polygon', coordinates: square(126, 34, 4) });
    expect(shouldShowTargetLocator(country, 5)).toBe(false);
    const point = withGeometry({ type: 'Point', coordinates: [127, 37.5] });
    expect(shouldShowTargetLocator(point, 2)).toBe(false);
  });

  it('probes the outline of the largest part, which an archipelago centroid can miss', () => {
    const archipelago = withGeometry({
      type: 'MultiPolygon',
      coordinates: [square(170, -40, 0.5), square(172, -44, 5)],
    });
    expect(targetOutlineProbe(archipelago)).toEqual([172, -44]);
    expect(targetOutlineProbe(withGeometry({ type: 'Point', coordinates: [127, 37.5] }))).toBeNull();
  });

  it('adds a point with the same identity only when asked', () => {
    expect(createTargetFeatureCollection(district, 'question').features).toHaveLength(1);
    const features = createTargetFeatureCollection(district, 'question', undefined, { locator: true }).features;
    expect(features.map((feature) => feature.geometry.type)).toEqual(['Polygon', 'Point']);
    expect(features[1]?.geometry).toEqual({ type: 'Point', coordinates: district.centroid });
    expect(features[1]?.properties.id).toBe(features[0]?.properties.id);
  });
});
