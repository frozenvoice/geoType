// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  parseRuntimeCapabilityDiagnostics,
  resolveMapQualityProvider,
} from '../../scripts/map-quality';
import { DEFAULT_MAP_STYLE_URL } from '../map/providers';

describe('map quality provider bootstrap', () => {
  it('uses the same no-env OpenFreeMap default as the application', () => {
    const bootstrap = resolveMapQualityProvider({});

    expect(bootstrap.providerId).toBe('hosted');
    expect(bootstrap.styleUrl).toBe(DEFAULT_MAP_STYLE_URL);
    expect(bootstrap.visualQualityEligible).toBe(true);
    expect(bootstrap.declaredTerrainSupport).toBe(false);
    expect(bootstrap.declaredBuildingsSupport).toBe(true);
  });

  it('keeps an explicit hosted style override', () => {
    const bootstrap = resolveMapQualityProvider({
      VITE_MAP_STYLE_URL: 'https://maps.example/custom/style.json',
    });

    expect(bootstrap.styleUrl).toBe('https://maps.example/custom/style.json');
  });

  it('keeps test and incomplete PMTiles providers ineligible', () => {
    expect(resolveMapQualityProvider({ VITE_MAP_PROVIDER: 'test' }).visualQualityEligible)
      .toBe(false);

    const pmtiles = resolveMapQualityProvider({ VITE_MAP_PROVIDER: 'pmtiles' });
    expect(pmtiles.visualQualityEligible).toBe(false);
    expect(pmtiles.resolution).toMatchObject({
      ok: false,
      missingVariables: ['VITE_MAP_STYLE_URL', 'VITE_PM_TILES_URL', 'VITE_MAP_ATTRIBUTION'],
    });
  });
});

describe('map quality runtime capability diagnostics', () => {
  it('reports Liberty-like buildings as active and terrain as unsupported', () => {
    expect(parseRuntimeCapabilityDiagnostics({
      terrainSupported: 'false',
      terrainState: 'not-requested',
      buildingLayer: 'building-3d',
      buildingState: 'active',
    })).toEqual({
      terrain: { supported: false, active: false },
      buildings: { supported: true, active: true },
    });
  });

  it('does not invent building support when no runtime layer exists', () => {
    expect(parseRuntimeCapabilityDiagnostics({
      terrainSupported: 'false',
      terrainState: 'not-requested',
      buildingLayer: '',
      buildingState: 'not-requested',
    }).buildings).toEqual({ supported: false, active: false });
  });

  it('treats an active externally added DEM as supported', () => {
    expect(parseRuntimeCapabilityDiagnostics({
      terrainSupported: 'false',
      terrainState: 'active',
      buildingLayer: '',
      buildingState: 'not-requested',
    }).terrain).toEqual({ supported: true, active: true });
  });

  it('keeps missing and pending runtime evidence unknown', () => {
    expect(parseRuntimeCapabilityDiagnostics({
      terrainSupported: null,
      terrainState: 'pending',
      buildingLayer: null,
      buildingState: null,
    })).toEqual({
      terrain: { supported: null, active: null },
      buildings: { supported: null, active: null },
    });
  });
});
