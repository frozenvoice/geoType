import { buildHierarchyIndex, type HierarchyIndex } from './hierarchy';
import { GeoDataLoader, type GeoDataLoaderOptions } from './loader';
import type { GeoDataManifest, GeoFeature } from './types';
import { DEFAULT_GEO_CATALOG_MANIFEST_URL } from './config';

export type GeoCatalog = {
  manifest: GeoDataManifest;
  features: GeoFeature[];
  hierarchy: HierarchyIndex;
};

export class GeoCatalogRuntime {
  private readonly loader: GeoDataLoader;
  private manifest: GeoDataManifest | null = null;
  private readonly featuresById = new Map<string, GeoFeature>();

  constructor(options: GeoDataLoaderOptions = {}) {
    this.loader = new GeoDataLoader(options);
  }

  private merge(features: readonly GeoFeature[]): GeoCatalog {
    for (const feature of features) this.featuresById.set(feature.id, feature);
    if (!this.manifest) throw new Error('The geodata manifest has not loaded yet.');
    const merged = [...this.featuresById.values()];
    return {
      manifest: this.manifest,
      features: merged,
      hierarchy: buildHierarchyIndex(merged),
    };
  }

  async loadInitialCatalog(): Promise<GeoCatalog> {
    const [manifest, features] = await Promise.all([
      this.loader.loadManifest(),
      this.loader.loadInitialFeatures(),
    ]);
    this.manifest = manifest;
    return this.merge(features);
  }

  async expandForSelection(feature: GeoFeature): Promise<GeoCatalog> {
    this.manifest ??= await this.loader.loadManifest();
    const features = await this.loader.loadFeaturesForSelection(feature);
    return this.merge(features);
  }
}

/** Loads only world navigation shards; use GeoCatalogRuntime to expand selections. */
export async function loadGeoCatalog(options: GeoDataLoaderOptions = {}): Promise<GeoCatalog> {
  return new GeoCatalogRuntime(options).loadInitialCatalog();
}

/** Explicitly named alias for tests and development screens using the local catalog. */
export function loadDevelopmentFixtureCatalog(
  options: Omit<GeoDataLoaderOptions, 'manifestUrl'> = {},
): Promise<GeoCatalog> {
  return loadGeoCatalog({ ...options, manifestUrl: DEFAULT_GEO_CATALOG_MANIFEST_URL });
}
