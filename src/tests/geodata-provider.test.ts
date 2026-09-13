import { describe, expect, it, vi } from 'vitest';

import { MemoryGeoDataShardCache } from '../geodata/cache';
import {
  DEFAULT_GEO_CATALOG_BASE_URL,
  DEFAULT_GEO_CATALOG_MANIFEST_URL,
  resolveGeoCatalogBaseUrl,
  resolveGeoCatalogMode,
  resolveGeoCatalogManifestUrl,
  resolveWorldCountryBaseUrl,
} from '../geodata/config';
import { ManifestGeoCatalogProvider } from '../geodata/providers';
import type { GeoDataFetcher } from '../geodata/loader';

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe('Geo Catalog provider configuration', () => {
  it('uses the checked-in public/geodata path when no environment value exists', () => {
    expect(DEFAULT_GEO_CATALOG_BASE_URL).toBe('/geodata');
    expect(DEFAULT_GEO_CATALOG_MANIFEST_URL).toBe('/geodata/manifest.json');
    expect(resolveGeoCatalogBaseUrl(undefined)).toBe('/geodata');
    expect(resolveGeoCatalogBaseUrl('   ')).toBe('/geodata');
  });

  it('never selects the development fixture for ordinary development or production', () => {
    expect(resolveGeoCatalogMode()).toBe('production');
    expect(resolveGeoCatalogMode({ isDevelopment: true })).toBe('production');
    expect(resolveGeoCatalogMode({
      isDevelopment: false,
      fixtureEnvironmentValue: 'true',
    })).toBe('production');
    expect(resolveWorldCountryBaseUrl()).toBe('/geodata/world');
  });

  it('selects the fixture only through an explicit test, query, or development flag', () => {
    expect(resolveGeoCatalogMode({ isTest: true })).toBe('fixture');
    expect(resolveGeoCatalogMode({
      searchParams: new URLSearchParams('fixture=1'),
    })).toBe('fixture');
    expect(resolveGeoCatalogMode({
      isDevelopment: true,
      fixtureEnvironmentValue: 'true',
    })).toBe('fixture');
  });

  it('resolves relative, root-relative, and absolute catalog roots without throwing', () => {
    expect(resolveGeoCatalogManifestUrl('/assets/geodata/')).toBe(
      '/assets/geodata/manifest.json',
    );
    expect(resolveGeoCatalogManifestUrl('catalog')).toBe('catalog/manifest.json');
    expect(resolveGeoCatalogManifestUrl('https://data.example/geotype/')).toBe(
      'https://data.example/geotype/manifest.json',
    );
  });

  it('preserves URL parameters and accepts an explicit manifest URL', () => {
    expect(resolveGeoCatalogManifestUrl('/geodata?version=v2')).toBe(
      '/geodata/manifest.json?version=v2',
    );
    expect(resolveGeoCatalogManifestUrl('/geodata/manifest.json?version=v2')).toBe(
      '/geodata/manifest.json?version=v2',
    );
  });

  it('loads catalog data through the catalog provider independently of map tiles', async () => {
    const manifest = {
      schemaVersion: 1,
      catalogVersion: 'provider-test-v1',
      generatedAt: '2026-07-19T00:00:00.000Z',
      scopeLabel: 'provider test',
      scopeComplete: false,
      disclaimer: 'Test data.',
      sourceVersions: { custom: 'test-v1' },
      totals: { shardCount: 1, featureCount: 1, byteSize: 0 },
      shards: [
        {
          id: 'world',
          path: 'world.json',
          checksum: `sha256:${'a'.repeat(64)}`,
          byteSize: 0,
          featureCount: 1,
          compression: 'none',
          sourceVersion: 'test-v1',
          featureTypes: ['continent'],
          scopeFeatureIds: ['asia'],
          countryCodes: [],
          dependsOn: [],
        },
      ],
    };
    const collection = {
      type: 'FeatureCollection',
      features: [
        {
          id: 'asia',
          source: 'custom',
          sourceVersion: 'test-v1',
          featureType: 'continent',
          name: 'Asia',
          localizedNames: {},
          aliases: [],
          geometry: { type: 'Point', coordinates: [100, 35] },
          centroid: [100, 35],
          bbox: [100, 35, 100, 35],
          parentIds: [],
          recommendedMinZoom: 0,
          recommendedMaxZoom: 4,
        },
      ],
    };
    const shardPayload = JSON.stringify(collection);
    manifest.totals.byteSize = shardPayload.length;
    manifest.shards[0]!.byteSize = shardPayload.length;

    const fetcher = vi.fn<GeoDataFetcher>((input) => {
      const url = requestUrl(input);
      const payload = url.endsWith('manifest.json')
        ? JSON.stringify(manifest)
        : shardPayload;
      return Promise.resolve(new Response(payload));
    });
    const provider = new ManifestGeoCatalogProvider({
      fetcher,
      cache: new MemoryGeoDataShardCache(),
      checksum: () => Promise.resolve(`sha256:${'a'.repeat(64)}`),
    });

    const catalog = await provider.loadInitialCatalog();

    expect(provider.baseUrl).toBe('/geodata');
    expect(provider.manifestUrl).toBe('/geodata/manifest.json');
    expect(catalog.features.map((feature) => feature.id)).toEqual(['asia']);
    expect(fetcher.mock.calls.map(([input]) => requestUrl(input))).toEqual([
      'http://localhost:3000/geodata/manifest.json',
      'http://localhost:3000/geodata/world.json',
    ]);
  });
});
