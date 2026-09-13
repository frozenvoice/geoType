import { describe, expect, it, vi } from 'vitest';

import { MemoryGeoDataShardCache } from '../geodata/cache';
import {
  GeoDataLoader,
  GeoDataResourceError,
  type GeoDataFetcher,
} from '../geodata/loader';
import type {
  GeoDataManifest,
  GeoFeature,
  GeoFeatureCollection,
  GeoFeatureType,
} from '../geodata/types';

const VALID_CHECKSUM = `sha256:${'a'.repeat(64)}`;
const INVALID_CHECKSUM = `sha256:${'b'.repeat(64)}`;

function feature(
  id: string,
  parentIds: string[] = [],
  featureType: GeoFeatureType = parentIds.length === 0 ? 'continent' : 'country',
): GeoFeature {
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

function response(payload: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(payload),
  } as Response;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function fixture(version = 'catalog-v1') {
  const collection: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: [feature('asia')],
  };
  const shardPayload = JSON.stringify(collection);
  const manifest: GeoDataManifest = {
    schemaVersion: 1,
    catalogVersion: version,
    generatedAt: '2026-07-19T00:00:00.000Z',
    scopeLabel: 'test fixture',
    scopeComplete: false,
    disclaimer: 'Test fixture only.',
    sourceVersions: { custom: 'test-v1' },
    totals: { shardCount: 1, featureCount: 1, byteSize: shardPayload.length },
    shards: [
      {
        id: 'world',
        path: '/geodata/world.json',
        checksum: VALID_CHECKSUM,
        byteSize: shardPayload.length,
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
  return { manifestPayload: JSON.stringify(manifest), shardPayload };
}

function createFetcher(manifestPayload: string, shardPayload: string) {
  return vi.fn<GeoDataFetcher>((input) =>
    Promise.resolve(
      response(requestUrl(input).endsWith('manifest.json') ? manifestPayload : shardPayload),
    ),
  );
}

describe('GeoDataLoader', () => {
  it('loads a shard lazily and then reuses the versioned cache', async () => {
    const { manifestPayload, shardPayload } = fixture();
    const cache = new MemoryGeoDataShardCache();
    const fetcher = createFetcher(manifestPayload, shardPayload);
    const checksum = (payload: string) =>
      Promise.resolve(payload === shardPayload ? VALID_CHECKSUM : INVALID_CHECKSUM);
    const options = {
      manifestUrl: 'https://example.test/geodata/manifest.json',
      fetcher,
      cache,
      checksum,
    };
    const firstLoader = new GeoDataLoader(options);

    await firstLoader.loadManifest();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await firstLoader.loadShard('world');
    expect(fetcher).toHaveBeenCalledTimes(2);

    const secondLoader = new GeoDataLoader(options);
    await secondLoader.loadShard('world');
    expect(fetcher).toHaveBeenCalledTimes(3); // second manifest only; shard came from cache
  });

  it('deletes a corrupt cached shard and recovers from its source', async () => {
    const { manifestPayload, shardPayload } = fixture();
    const cache = new MemoryGeoDataShardCache();
    await cache.prepareVersion('catalog-v1');
    await cache.put({
      key: 'world',
      catalogVersion: 'catalog-v1',
      checksum: VALID_CHECKSUM,
      payload: '{truncated',
      storedAt: 0,
    });
    const fetcher = createFetcher(manifestPayload, shardPayload);
    const loader = new GeoDataLoader({
      manifestUrl: 'https://example.test/geodata/manifest.json',
      fetcher,
      cache,
      checksum: (payload) =>
        Promise.resolve(payload === shardPayload ? VALID_CHECKSUM : INVALID_CHECKSUM),
    });

    const collection = await loader.loadShard('world');
    expect(collection.features).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await cache.get('world'))?.payload).toBe(shardPayload);
  });

  it('invalidates every cached shard when the manifest version changes', async () => {
    const cache = new MemoryGeoDataShardCache();
    await cache.prepareVersion('catalog-v1');
    await cache.put({
      key: 'world',
      catalogVersion: 'catalog-v1',
      checksum: VALID_CHECKSUM,
      payload: 'payload',
      storedAt: 0,
    });

    await cache.prepareVersion('catalog-v2');
    expect(await cache.get('world')).toBeUndefined();
  });

  it('loads a complete root scope including shard dependencies', async () => {
    const asia = feature('asia');
    const korea = feature('kr', ['asia']);
    const worldPayload = JSON.stringify({ type: 'FeatureCollection', features: [asia] });
    const countryPayload = JSON.stringify({ type: 'FeatureCollection', features: [korea] });
    const worldChecksum = `sha256:${'c'.repeat(64)}`;
    const countryChecksum = `sha256:${'d'.repeat(64)}`;
    const manifest: GeoDataManifest = {
      schemaVersion: 1,
      catalogVersion: 'dependency-test',
      generatedAt: '2026-07-19T00:00:00.000Z',
      scopeLabel: 'dependency test',
      scopeComplete: false,
      disclaimer: 'Test only.',
      sourceVersions: { custom: 'test-v1' },
      totals: {
        shardCount: 2,
        featureCount: 2,
        byteSize: worldPayload.length + countryPayload.length,
      },
      shards: [
        {
          id: 'world', path: '/world.json', checksum: worldChecksum,
          byteSize: worldPayload.length, featureCount: 1, compression: 'none',
          sourceVersion: 'test-v1', featureTypes: ['continent'], scopeFeatureIds: ['asia'],
          countryCodes: [], dependsOn: [],
        },
        {
          id: 'countries', path: '/countries.json', checksum: countryChecksum,
          byteSize: countryPayload.length, featureCount: 1, compression: 'none',
          sourceVersion: 'test-v1', featureTypes: ['country'], scopeFeatureIds: ['kr'],
          countryCodes: [], dependsOn: ['world'],
        },
      ],
    };
    const fetcher = vi.fn<GeoDataFetcher>((input) => {
      const url = requestUrl(input);
      if (url.endsWith('manifest.json')) return Promise.resolve(response(JSON.stringify(manifest)));
      if (url.endsWith('world.json')) return Promise.resolve(response(worldPayload));
      return Promise.resolve(response(countryPayload));
    });
    const loader = new GeoDataLoader({
      manifestUrl: 'https://example.test/manifest.json',
      fetcher,
      cache: new MemoryGeoDataShardCache(),
      checksum: (payload) =>
        Promise.resolve(payload === worldPayload ? worldChecksum : countryChecksum),
    });

    await expect(loader.loadFeaturesForRoot('kr')).resolves.toEqual([asia, korea]);
  });

  it('reports the failed manifest resource, status and URL', async () => {
    const loader = new GeoDataLoader({
      manifestUrl: 'https://example.test/geodata/manifest.json',
      fetcher: () => Promise.resolve(response('', 503)),
      cache: new MemoryGeoDataShardCache(),
    });

    const manifestError = await loader.loadManifest().catch((error: unknown) => error);
    expect(manifestError).toBeInstanceOf(GeoDataResourceError);
    expect(manifestError).toMatchObject({
      name: 'GeoDataResourceError',
      resourceType: 'Geo Catalog manifest',
      statusCode: 503,
      resourceUrl: 'https://example.test/geodata/manifest.json',
    });
  });

  it('reports the actual failed shard URL instead of the manifest URL', async () => {
    const { manifestPayload } = fixture();
    const loader = new GeoDataLoader({
      manifestUrl: 'https://example.test/geodata/manifest.json',
      fetcher: (input) => Promise.resolve(
        requestUrl(input).endsWith('manifest.json')
          ? response(manifestPayload)
          : response('', 404),
      ),
      cache: new MemoryGeoDataShardCache(),
    });

    const shardError = await loader.loadShard('world').catch((error: unknown) => error);
    expect(shardError).toBeInstanceOf(GeoDataResourceError);
    expect(shardError).toMatchObject({
      name: 'GeoDataResourceError',
      resourceType: 'Geo Catalog shard',
      statusCode: 404,
      resourceUrl: 'https://example.test/geodata/world.json',
    });
  });

  it('loads world navigation first, then expands only the selected hierarchy shards', async () => {
    const asia = feature('asia');
    const korea = feature('kr', ['asia'], 'country');
    const seoul = feature('seoul', ['kr'], 'admin1');
    const station = feature('station', ['seoul'], 'station');
    const collections = {
      world: JSON.stringify({ type: 'FeatureCollection', features: [asia] }),
      countries: JSON.stringify({ type: 'FeatureCollection', features: [korea] }),
      admin: JSON.stringify({ type: 'FeatureCollection', features: [seoul] }),
      detail: JSON.stringify({ type: 'FeatureCollection', features: [station] }),
    };
    const checksums = {
      world: `sha256:${'1'.repeat(64)}`,
      countries: `sha256:${'2'.repeat(64)}`,
      admin: `sha256:${'3'.repeat(64)}`,
      detail: `sha256:${'4'.repeat(64)}`,
    };
    const descriptor = (
      id: keyof typeof collections,
      featureTypes: GeoFeatureType[],
      scopeFeatureIds: string[],
      dependsOn: string[],
    ) => ({
      id,
      path: `/${id}.json`,
      checksum: checksums[id],
      byteSize: collections[id].length,
      featureCount: 1,
      compression: 'none' as const,
      sourceVersion: 'test-v1',
      featureTypes,
      scopeFeatureIds,
      countryCodes: id === 'world' ? [] : ['KR'],
      dependsOn,
    });
    const manifest: GeoDataManifest = {
      schemaVersion: 1,
      catalogVersion: 'progressive-test',
      generatedAt: '2026-07-19T00:00:00.000Z',
      scopeLabel: 'progressive test',
      scopeComplete: false,
      disclaimer: 'Test only.',
      sourceVersions: { custom: 'test-v1' },
      totals: {
        shardCount: 4,
        featureCount: 4,
        byteSize: Object.values(collections).reduce((sum, payload) => sum + payload.length, 0),
      },
      shards: [
        descriptor('world', ['continent'], ['asia'], []),
        descriptor('countries', ['country'], ['asia', 'kr'], ['world']),
        descriptor('admin', ['admin1'], ['kr', 'seoul'], ['countries']),
        descriptor('detail', ['station'], ['seoul'], ['admin']),
      ],
    };
    const fetchedPaths: string[] = [];
    const fetcher = vi.fn<GeoDataFetcher>((input) => {
      const url = requestUrl(input);
      fetchedPaths.push(new URL(url).pathname);
      if (url.endsWith('manifest.json')) return Promise.resolve(response(JSON.stringify(manifest)));
      const id = (Object.keys(collections) as Array<keyof typeof collections>)
        .find((candidate) => url.endsWith(`/${candidate}.json`));
      if (!id) return Promise.resolve(response('', 404));
      return Promise.resolve(response(collections[id]));
    });
    const loader = new GeoDataLoader({
      manifestUrl: 'https://example.test/manifest.json',
      fetcher,
      cache: new MemoryGeoDataShardCache(),
      checksum: (payload) => {
        const id = (Object.keys(collections) as Array<keyof typeof collections>)
          .find((candidate) => collections[candidate] === payload);
        return Promise.resolve(id ? checksums[id] : INVALID_CHECKSUM);
      },
    });

    await expect(loader.loadInitialFeatures()).resolves.toEqual([asia, korea]);
    expect(fetchedPaths).not.toContain('/admin.json');
    expect(fetchedPaths).not.toContain('/detail.json');

    await expect(loader.loadFeaturesForSelection(korea)).resolves.toEqual([asia, korea, seoul]);
    expect(fetchedPaths).toContain('/admin.json');
    expect(fetchedPaths).not.toContain('/detail.json');

    await expect(loader.loadFeaturesForSelection(seoul)).resolves.toEqual([
      asia,
      korea,
      seoul,
      station,
    ]);
    expect(fetchedPaths).toContain('/detail.json');
  });
});
