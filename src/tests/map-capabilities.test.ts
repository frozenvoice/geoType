import { describe, expect, it } from 'vitest';

import { resolveMapCapabilityConfiguration } from '../map/capabilities';

describe('map capability configuration', () => {
  it('keeps optional capabilities disabled unless they are explicitly requested', () => {
    const configuration = resolveMapCapabilityConfiguration({});

    expect(configuration.terrain).toMatchObject({
      requested: false,
      configured: false,
      options: null,
    });
    expect(configuration.buildings).toMatchObject({
      requested: false,
      configured: false,
      options: null,
    });
    expect(configuration.issues).toEqual([]);
  });

  it('parses a style-owned terrain source and numeric rendering options', () => {
    const configuration = resolveMapCapabilityConfiguration({
      VITE_MAP_TERRAIN_ENABLED: 'true',
      VITE_MAP_TERRAIN_SOURCE_ID: 'terrain-dem',
      VITE_MAP_TERRAIN_TILE_SIZE: '512',
      VITE_MAP_TERRAIN_EXAGGERATION: '1.4',
    });

    expect(configuration.terrain).toEqual({
      requested: true,
      configured: true,
      options: {
        enabled: true,
        sourceId: 'terrain-dem',
        tileSize: 512,
        exaggeration: 1.4,
      },
      issues: [],
    });
  });

  it('parses an external DEM tile list', () => {
    const configuration = resolveMapCapabilityConfiguration({
      VITE_MAP_TERRAIN_ENABLED: 'true',
      VITE_MAP_TERRAIN_SOURCE_ID: 'external-dem',
      VITE_MAP_TERRAIN_TILES: '["https://dem.example/{z}/{x}/{y}.png"]',
    });

    expect(configuration.terrain.options).toMatchObject({
      sourceId: 'external-dem',
      tiles: ['https://dem.example/{z}/{x}/{y}.png'],
    });
  });

  it('rejects ambiguous or incomplete terrain configuration', () => {
    const configuration = resolveMapCapabilityConfiguration({
      VITE_MAP_TERRAIN_ENABLED: 'true',
      VITE_MAP_TERRAIN_SOURCE_URL: 'https://dem.example/tilejson.json',
      VITE_MAP_TERRAIN_TILES: 'https://dem.example/{z}/{x}/{y}.png',
    });

    expect(configuration.terrain.configured).toBe(false);
    expect(configuration.terrain.options).toBeNull();
    expect(configuration.terrain.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('VITE_MAP_TERRAIN_SOURCE_ID'),
      expect.stringContaining('Configure only one'),
    ]));
  });

  it('parses a vector building source and extrusion layer options', () => {
    const configuration = resolveMapCapabilityConfiguration({
      VITE_MAP_BUILDINGS_ENABLED: 'true',
      VITE_MAP_BUILDINGS_SOURCE_ID: 'openmaptiles',
      VITE_MAP_BUILDINGS_SOURCE_LAYER: 'building',
      VITE_MAP_BUILDINGS_LAYER_ID: 'geotype-buildings',
      VITE_MAP_BUILDINGS_MIN_ZOOM: '13.5',
    });

    expect(configuration.buildings).toEqual({
      requested: true,
      configured: true,
      options: {
        enabled: true,
        sourceId: 'openmaptiles',
        sourceLayer: 'building',
        layerId: 'geotype-buildings',
        minZoom: 13.5,
      },
      issues: [],
    });
  });

  it('does not silently accept malformed opt-in values', () => {
    const configuration = resolveMapCapabilityConfiguration({
      VITE_MAP_TERRAIN_ENABLED: 'yes',
      VITE_MAP_BUILDINGS_ENABLED: '1',
    });

    expect(configuration.terrain.requested).toBe(false);
    expect(configuration.buildings.requested).toBe(false);
    expect(configuration.issues).toHaveLength(2);
  });
});
