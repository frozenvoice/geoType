import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAP_STYLE_URL,
  HostedMapProvider,
  PMTilesMapProvider,
  TestMapProvider,
  resolveMapProvider,
} from '../map/providers';
import { resolveCapabilityState } from '../map/types';

describe('map provider configuration', () => {
  it('uses OpenFreeMap Liberty without environment variables', () => {
    const resolution = resolveMapProvider({});

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.provider).toBeInstanceOf(HostedMapProvider);
    expect(resolution.provider.getStyleUrl()).toBe(DEFAULT_MAP_STYLE_URL);
    expect(resolution.provider.supportsTerrain).toBe(false);
    expect(resolution.provider.supportsBuildings).toBe(true);
    expect(resolution.visualQualityEligible).toBe(true);
  });

  it('prefers an explicitly configured hosted style over OpenFreeMap', () => {
    const resolution = resolveMapProvider({
      VITE_MAP_STYLE_URL: 'https://maps.example/custom/style.json',
    });

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.provider.getStyleUrl()).toBe('https://maps.example/custom/style.json');
  });

  it('injects a configured access token only into the configured style origin', () => {
    const provider = new HostedMapProvider({
      styleUrl: 'https://maps.example/style.json?language=ko',
      accessToken: 'secret-token',
      tokenParameter: 'key',
    });

    expect(provider.getStyleUrl()).toContain('key=secret-token');
    expect(provider.transformRequest('https://maps.example/tiles/1/2/3.pbf', 'Tile').url).toContain(
      'key=secret-token',
    );
    expect(
      provider.transformRequest('https://third-party.example/sprite.png', 'SpriteImage').url,
    ).toBe('https://third-party.example/sprite.png');
    expect(provider.transformRequest('data:image/png;base64,abc', 'Image').url).toBe(
      'data:image/png;base64,abc',
    );
  });

  it('resolves PMTiles only when style, archive, and explicit attribution are configured', () => {
    const incomplete = resolveMapProvider({
      VITE_MAP_PROVIDER: 'pmtiles',
      VITE_MAP_STYLE_URL: '/map/style.json',
    });
    expect(incomplete.ok).toBe(false);

    const complete = resolveMapProvider({
      VITE_MAP_PROVIDER: 'pmtiles',
      VITE_MAP_STYLE_URL: '/map/style.json',
      VITE_PM_TILES_URL: 'https://maps.example/world.pmtiles',
    });
    expect(complete.ok).toBe(false);
    if (complete.ok) return;
    expect(complete.missingVariables).toEqual(['VITE_MAP_ATTRIBUTION']);

    const attributed = resolveMapProvider({
      VITE_MAP_PROVIDER: 'pmtiles',
      VITE_MAP_STYLE_URL: '/map/style.json',
      VITE_PM_TILES_URL: 'https://maps.example/world.pmtiles',
      VITE_MAP_ATTRIBUTION: 'Example Maps © Example Data Authors',
    });
    expect(attributed.ok).toBe(true);
    if (!attributed.ok) return;
    expect(attributed.provider).toBeInstanceOf(PMTilesMapProvider);
    expect(attributed.provider.attribution).toBe('Example Maps © Example Data Authors');
    expect((attributed.provider as PMTilesMapProvider).getArchiveSourceUrl()).toBe(
      'pmtiles://https://maps.example/world.pmtiles',
    );
  });

  it('marks the test renderer as ineligible for visual quality claims', () => {
    const resolution = resolveMapProvider({ VITE_MAP_PROVIDER: 'test' });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.provider).toBeInstanceOf(TestMapProvider);
    expect(resolution.visualQualityEligible).toBe(false);
  });

  it('enables terrain and buildings only when provider capability permits it', () => {
    const provider = new TestMapProvider();
    expect(resolveCapabilityState(provider, { terrain: true, buildings: true })).toEqual({
      terrain: { enabled: false, reason: 'unsupported' },
      buildings: { enabled: false, reason: 'unsupported' },
    });
  });
});
