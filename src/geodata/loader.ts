import {
  createDefaultGeoDataShardCache,
  type GeoDataShardCache,
} from './cache';
import { sha256Text } from './checksum';
import {
  GeoDataManifestSchema,
  GeoFeatureCollectionSchema,
} from './schemas';
import type {
  CachedGeoDataShard,
  GeoDataManifest,
  GeoDataShardDescriptor,
  GeoFeature,
  GeoFeatureCollection,
} from './types';
import { assertValidGeoCatalog } from './validation';
import { DEFAULT_GEO_CATALOG_MANIFEST_URL } from './config';

export type GeoDataFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type GeoDataLoaderOptions = {
  manifestUrl?: string;
  fetcher?: GeoDataFetcher;
  cache?: GeoDataShardCache;
  checksum?: (payload: string) => Promise<string>;
  now?: () => number;
};

export class GeoDataResourceError extends Error {
  readonly resourceType: 'Geo Catalog manifest' | 'Geo Catalog shard';
  readonly statusCode: number | null;
  readonly resourceUrl: string;

  constructor(options: {
    message: string;
    resourceType: 'Geo Catalog manifest' | 'Geo Catalog shard';
    statusCode?: number | null;
    resourceUrl: string;
    cause?: unknown;
  }) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'GeoDataResourceError';
    this.resourceType = options.resourceType;
    this.statusCode = options.statusCode ?? null;
    this.resourceUrl = options.resourceUrl;
  }
}

function resolveUrl(path: string, manifestUrl: string): string {
  const documentBase = globalThis.location?.href ?? 'http://localhost/';
  const absoluteManifestUrl = new URL(manifestUrl, documentBase);
  return new URL(path, absoluteManifestUrl).toString();
}

async function fetchResourceText(
  fetcher: GeoDataFetcher,
  url: string,
  label: string,
  resourceType: GeoDataResourceError['resourceType'],
  init?: RequestInit,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (cause) {
    throw new GeoDataResourceError({
      message: `Unable to load ${label}: network request failed.`,
      resourceType,
      statusCode: null,
      resourceUrl: url,
      cause,
    });
  }
  if (!response.ok) {
    throw new GeoDataResourceError({
      message: `Unable to load ${label}: HTTP ${response.status}.`,
      resourceType,
      statusCode: response.status,
      resourceUrl: url,
    });
  }
  return response.text();
}

export class GeoDataLoader {
  private readonly manifestUrl: string;
  private readonly fetcher: GeoDataFetcher;
  private readonly cache: GeoDataShardCache;
  private readonly checksum: (payload: string) => Promise<string>;
  private readonly now: () => number;
  private manifestPromise: Promise<GeoDataManifest> | undefined;
  private readonly shardPromises = new Map<string, Promise<GeoFeatureCollection>>();

  constructor(options: GeoDataLoaderOptions = {}) {
    this.manifestUrl = options.manifestUrl ?? DEFAULT_GEO_CATALOG_MANIFEST_URL;
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.cache = options.cache ?? createDefaultGeoDataShardCache();
    this.checksum = options.checksum ?? sha256Text;
    this.now = options.now ?? Date.now;
  }

  loadManifest(): Promise<GeoDataManifest> {
    this.manifestPromise ??= this.fetchManifest();
    return this.manifestPromise;
  }

  private async fetchManifest(): Promise<GeoDataManifest> {
    const url = resolveUrl(this.manifestUrl, this.manifestUrl);
    const payload = await fetchResourceText(
      this.fetcher,
      url,
      'geodata manifest',
      'Geo Catalog manifest',
      { cache: 'no-cache' },
    );
    const parsedJson: unknown = JSON.parse(payload);
    const manifest = GeoDataManifestSchema.parse(parsedJson);
    await this.cache.prepareVersion(manifest.catalogVersion);
    return manifest;
  }

  async loadShard(shardId: string): Promise<GeoFeatureCollection> {
    const existing = this.shardPromises.get(shardId);
    if (existing) return existing;

    const promise = this.loadShardUncached(shardId).catch((error: unknown) => {
      this.shardPromises.delete(shardId);
      throw error;
    });
    this.shardPromises.set(shardId, promise);
    return promise;
  }

  private async loadShardUncached(shardId: string): Promise<GeoFeatureCollection> {
    const manifest = await this.loadManifest();
    const descriptor = manifest.shards.find((candidate) => candidate.id === shardId);
    if (!descriptor) throw new Error(`Unknown geodata shard: ${shardId}`);

    const cached = await this.cache.get(descriptor.id);
    if (cached) {
      const collection = await this.readCachedShard(cached, descriptor, manifest.catalogVersion);
      if (collection) return collection;
    }

    const url = resolveUrl(descriptor.path, this.manifestUrl);
    const payload = await fetchResourceText(
      this.fetcher,
      url,
      `geodata shard ${shardId}`,
      'Geo Catalog shard',
    );
    const collection = await this.parseAndVerifyShard(payload, descriptor);
    await this.cache.put({
      key: descriptor.id,
      catalogVersion: manifest.catalogVersion,
      checksum: descriptor.checksum,
      payload,
      storedAt: this.now(),
    });
    return collection;
  }

  private async readCachedShard(
    cached: CachedGeoDataShard,
    descriptor: GeoDataShardDescriptor,
    catalogVersion: string,
  ): Promise<GeoFeatureCollection | undefined> {
    if (
      cached.catalogVersion !== catalogVersion ||
      cached.checksum !== descriptor.checksum
    ) {
      await this.cache.delete(descriptor.id);
      return undefined;
    }

    try {
      return await this.parseAndVerifyShard(cached.payload, descriptor);
    } catch {
      // A truncated, manually edited, or stale IndexedDB entry must never make
      // the game permanently unusable. Delete it and retry the network shard.
      await this.cache.delete(descriptor.id);
      return undefined;
    }
  }

  private async parseAndVerifyShard(
    payload: string,
    descriptor: GeoDataShardDescriptor,
  ): Promise<GeoFeatureCollection> {
    const actualChecksum = await this.checksum(payload);
    if (actualChecksum !== descriptor.checksum) {
      throw new Error(
        `Checksum mismatch for ${descriptor.id}: expected ${descriptor.checksum}, received ${actualChecksum}.`,
      );
    }

    // Zod 3 models optional object keys as `T | undefined` in its output type;
    // the parsed runtime value still omits absent keys and conforms to our
    // exact-optional GeoFeature contract.
    const collection = GeoFeatureCollectionSchema.parse(
      JSON.parse(payload),
    ) as GeoFeatureCollection;
    if (collection.features.length !== descriptor.featureCount) {
      throw new Error(
        `Feature count mismatch for ${descriptor.id}: expected ${descriptor.featureCount}, received ${collection.features.length}.`,
      );
    }

    return collection;
  }

  private shardClosure(
    manifest: GeoDataManifest,
    initialShardIds: readonly string[],
  ): string[] {
    const byId = new Map(manifest.shards.map((shard) => [shard.id, shard]));
    const selected = new Set<string>();

    const include = (shardId: string): void => {
      if (selected.has(shardId)) return;
      const descriptor = byId.get(shardId);
      if (!descriptor) throw new Error(`Missing shard dependency: ${shardId}`);
      for (const dependencyId of descriptor.dependsOn) include(dependencyId);
      selected.add(shardId);
    };

    for (const shardId of initialShardIds) include(shardId);
    return [...selected];
  }

  async loadFeaturesForRoot(rootFeatureId: string): Promise<GeoFeature[]> {
    const manifest = await this.loadManifest();
    const directShardIds = manifest.shards
      .filter((shard) => shard.scopeFeatureIds.includes(rootFeatureId))
      .map((shard) => shard.id);

    if (directShardIds.length === 0) {
      throw new Error(`No geodata shard covers feature ${rootFeatureId}.`);
    }

    return this.loadFeatureSet(this.shardClosure(manifest, directShardIds));
  }

  /**
   * Loads only the world navigation index used before a region is selected.
   * Detailed country/region shards stay on disk until the matching selection
   * asks for them.
   */
  async loadInitialFeatures(): Promise<GeoFeature[]> {
    const manifest = await this.loadManifest();
    const navigationShardIds = manifest.shards
      .filter((shard) =>
        shard.featureTypes.includes('continent') || shard.featureTypes.includes('country'))
      .map((shard) => shard.id);

    if (navigationShardIds.length === 0) {
      throw new Error('The geodata manifest does not contain world navigation shards.');
    }

    return this.loadFeatureSet(this.shardClosure(manifest, navigationShardIds));
  }

  /**
   * Expands the catalog just far enough for the selected hierarchy level.
   * Continents reuse the already-loaded country index; countries load their
   * administrative index; a concrete region loads every shard explicitly
   * scoped to that region. Dependency closure always supplies its ancestors.
   */
  async loadFeaturesForSelection(root: Pick<GeoFeature, 'id' | 'featureType'>): Promise<GeoFeature[]> {
    if (root.featureType === 'continent') return this.loadInitialFeatures();

    const manifest = await this.loadManifest();
    const directShardIds = manifest.shards
      .filter((shard) => {
        if (!shard.scopeFeatureIds.includes(root.id)) return false;
        if (root.featureType === 'country') {
          return shard.featureTypes.includes('admin1');
        }
        return true;
      })
      .map((shard) => shard.id);

    if (directShardIds.length === 0) {
      // A leaf can legitimately have no detail shard. Its dependency/index
      // data is already present, so return the current world navigation set.
      return this.loadInitialFeatures();
    }

    return this.loadFeatureSet(this.shardClosure(manifest, directShardIds));
  }

  async loadAllFeatures(): Promise<GeoFeature[]> {
    const manifest = await this.loadManifest();
    return this.loadFeatureSet(manifest.shards.map((shard) => shard.id));
  }

  private async loadFeatureSet(shardIds: readonly string[]): Promise<GeoFeature[]> {
    const collections = await Promise.all(shardIds.map((shardId) => this.loadShard(shardId)));
    const featuresById = new Map<string, GeoFeature>();

    for (const feature of collections.flatMap((collection) => collection.features)) {
      if (featuresById.has(feature.id)) {
        throw new Error(`Feature ${feature.id} occurs in more than one loaded shard.`);
      }
      featuresById.set(feature.id, feature);
    }

    const features = [...featuresById.values()];
    assertValidGeoCatalog(features);
    return features;
  }
}
