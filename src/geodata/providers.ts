import {
  GeoCatalogRuntime,
  type GeoCatalog,
} from './catalog';
import {
  resolveGeoCatalogBaseUrl,
  resolveGeoCatalogManifestUrl,
} from './config';
import type { GeoDataLoaderOptions } from './loader';
import type { GeoDataManifest, GeoFeature, GeoMultiPolygon } from './types';
import { buildHierarchyIndex } from './hierarchy';
import {
  loadWorldCountryDataset,
  worldCountryDataUrls,
  type WorldCountryDataFetcher,
  type WorldCountryDataset,
  type WorldCountryFeature,
} from './countries';
import {
  WORLD_PLACES_CATALOG_VERSION,
  loadWorldPopulatedPlacesDataset,
  worldPopulatedPlacesDataUrls,
  type WorldPopulatedPlacesDataset,
} from './populatedPlaces';
import { calculateBoundingBox } from './geometry';
import {
  localizedScopeNames,
  placeNamesForWorldCountry,
} from './countryNameOverrides';

export const WORLD_SCOPE_FEATURE_ID = 'natural-earth:world';

/**
 * Supplies gameplay features and geometry. It is intentionally independent of
 * the map provider, which only supplies the visual basemap and vector tiles.
 */
export interface GeoCatalogProvider {
  readonly baseUrl: string;
  readonly manifestUrl: string;
  loadInitialCatalog(): Promise<GeoCatalog>;
  expandForSelection(feature: GeoFeature): Promise<GeoCatalog>;
}

export type ManifestGeoCatalogProviderOptions =
  Omit<GeoDataLoaderOptions, 'manifestUrl'> & {
    baseUrl?: string | null;
  };

/** A manifest/shard catalog served either locally or from an HTTP origin. */
export class ManifestGeoCatalogProvider implements GeoCatalogProvider {
  readonly baseUrl: string;
  readonly manifestUrl: string;
  private readonly runtime: GeoCatalogRuntime;

  constructor(options: ManifestGeoCatalogProviderOptions = {}) {
    const { baseUrl, ...loaderOptions } = options;
    this.baseUrl = resolveGeoCatalogBaseUrl(baseUrl);
    this.manifestUrl = resolveGeoCatalogManifestUrl(this.baseUrl);
    this.runtime = new GeoCatalogRuntime({
      ...loaderOptions,
      manifestUrl: this.manifestUrl,
    });
  }

  loadInitialCatalog(): Promise<GeoCatalog> {
    return this.runtime.loadInitialCatalog();
  }

  expandForSelection(feature: GeoFeature): Promise<GeoCatalog> {
    return this.runtime.expandForSelection(feature);
  }
}

export function createGeoCatalogProvider(
  options: ManifestGeoCatalogProviderOptions = {},
): GeoCatalogProvider {
  return new ManifestGeoCatalogProvider(options);
}

export type WorldCountryGeoCatalogProviderOptions = {
  baseUrl?: string | null;
  fetcher?: WorldCountryDataFetcher;
  /** Set false only for callers that intentionally provide country-only data. */
  includePopulatedPlaces?: boolean;
};

function countryToGeoFeature(country: WorldCountryFeature): GeoFeature {
  const properties = country.properties;
  return {
    id: country.id,
    source: 'natural-earth',
    sourceVersion: properties.sourceVersion,
    featureType: 'country',
    name: properties.name,
    localizedNames: {
      en: properties.nameEn,
      ...(properties.nameKo ? { ko: properties.nameKo } : {}),
    },
    aliases: properties.aliases,
    names: placeNamesForWorldCountry(properties),
    geometry: country.geometry,
    centroid: properties.centroid,
    bbox: country.bbox,
    parentIds: [properties.continentId],
    ...(properties.isoAlpha2 ? { countryCode: properties.isoAlpha2 } : {}),
    ...(properties.isoAlpha3
      ? { countryCodeAlpha3: properties.isoAlpha3 }
      : {}),
    naturalEarthCode: properties.naturalEarthCode,
    continentId: properties.continentId,
    nameLocal: properties.nameLocal,
    population: properties.population,
    recommendedMinZoom: 1,
    recommendedMaxZoom: 8,
  };
}

function continentGeometry(
  countries: readonly WorldCountryFeature[],
): GeoMultiPolygon {
  return {
    type: 'MultiPolygon',
    coordinates: countries.flatMap((country) =>
      country.geometry.type === 'Polygon'
        ? [country.geometry.coordinates]
        : country.geometry.coordinates,
    ),
  };
}

function datasetToCatalog(
  dataset: WorldCountryDataset,
  populatedPlacesDataset?: WorldPopulatedPlacesDataset,
): GeoCatalog {
  const populatedPlaces = populatedPlacesDataset?.features ?? [];
  const countriesById = new Map(
    dataset.collection.features.map((country) => [country.id, country]),
  );
  const continentFeatures: GeoFeature[] = dataset.index.continents.map((continent) => {
    const countries = continent.countryIds.map((countryId) => {
      const country = countriesById.get(countryId);
      if (!country) throw new Error(`${continent.id} references missing country ${countryId}.`);
      return country;
    });
    return {
      id: continent.id,
      source: 'natural-earth',
      sourceVersion: dataset.index.source.version,
      featureType: 'continent',
      name: continent.nameKo,
      localizedNames: { ko: continent.nameKo, en: continent.nameEn },
      aliases: [continent.nameKo, continent.nameEn, continent.code],
      names: localizedScopeNames(continent.nameKo, continent.nameEn),
      geometry: continentGeometry(countries),
      centroid: continent.centroid,
      bbox: continent.bbox,
      parentIds: [WORLD_SCOPE_FEATURE_ID],
      recommendedMinZoom: 0,
      recommendedMaxZoom: 4,
    };
  });
  const countryFeatures = dataset.collection.features.map(countryToGeoFeature);
  const worldGeometry = continentGeometry(dataset.collection.features);
  const worldFeature: GeoFeature = {
    id: WORLD_SCOPE_FEATURE_ID,
    source: 'natural-earth',
    sourceVersion: dataset.index.source.version,
    featureType: 'continent',
    name: '세계',
    localizedNames: { ko: '세계', en: 'World' },
    aliases: ['세계', 'World'],
    names: localizedScopeNames('세계', 'World'),
    geometry: worldGeometry,
    centroid: [0, 0],
    bbox: calculateBoundingBox(worldGeometry),
    parentIds: [],
    recommendedMinZoom: 0,
    recommendedMaxZoom: 2,
  };
  const features = [worldFeature, ...continentFeatures, ...countryFeatures, ...populatedPlaces];

  // GeoCatalog historically exposed manifest-shaped metadata. Production does
  // not fetch a manifest; this in-memory summary preserves that API while the
  // fixture-only ManifestGeoCatalogProvider remains available explicitly.
  const manifest: GeoDataManifest = {
    schemaVersion: 1,
    catalogVersion: populatedPlacesDataset
      ? WORLD_PLACES_CATALOG_VERSION
      : dataset.index.catalogVersion,
    generatedAt: populatedPlacesDataset?.index.generatedAt ?? dataset.index.generatedAt,
    scopeLabel: populatedPlaces.length > 0
      ? 'Natural Earth 1:10m global countries, capitals, cities, and towns'
      : 'Natural Earth 1:10m global Admin-0 country selection',
    scopeComplete: populatedPlacesDataset === undefined,
    disclaimer: populatedPlacesDataset
      ? 'Country boundaries are complete for Natural Earth Admin-0, while populated places are a curated 1:10m selection of capitals, cities, and towns; the place layer is not a census-complete settlement inventory.'
      : 'Complete for the bundled Natural Earth Admin-0 Countries layer; disputed-status features follow Natural Earth de facto policy and this catalog does not imply legal recognition.',
    sourceVersions: {
      'natural-earth': dataset.index.source.version,
      ...(populatedPlaces.length > 0
        ? { 'natural-earth-populated-places': populatedPlacesDataset?.index.source.version ?? '5.1.2' }
        : {}),
    },
    totals: {
      shardCount: populatedPlaces.length > 0 ? 3 : 2,
      featureCount: features.length,
      byteSize: dataset.index.source.countriesGeoJsonByteSize +
        (populatedPlacesDataset?.index.geoJsonByteSize ?? 0),
    },
    shards: [],
  };
  return { manifest, features, hierarchy: buildHierarchyIndex(features) };
}

/**
 * Production world catalog. It loads the checked-in 1:10m country and
 * populated-place datasets directly and never falls back to the fixture.
 */
export class WorldCountryGeoCatalogProvider implements GeoCatalogProvider {
  readonly baseUrl: string;
  /** Compatibility resource URL for existing error UI; no manifest is fetched. */
  readonly manifestUrl: string;
  readonly countryDataUrl: string;
  readonly countryIndexUrl: string;
  readonly populatedPlacesDataUrl: string;
  readonly populatedPlacesIndexUrl: string;
  private readonly fetcher: WorldCountryDataFetcher | undefined;
  private readonly includePopulatedPlaces: boolean;
  private catalogPromise: Promise<GeoCatalog> | undefined;

  constructor(options: WorldCountryGeoCatalogProviderOptions = {}) {
    const urls = worldCountryDataUrls(options.baseUrl);
    this.baseUrl = (options.baseUrl?.trim() || '/geodata/world').replace(/\/+$/, '');
    this.countryDataUrl = urls.countryDataUrl;
    this.countryIndexUrl = urls.countryIndexUrl;
    const placeUrls = worldPopulatedPlacesDataUrls(this.baseUrl);
    this.populatedPlacesDataUrl = placeUrls.placesDataUrl;
    this.populatedPlacesIndexUrl = placeUrls.placesIndexUrl;
    this.manifestUrl = this.countryIndexUrl;
    this.fetcher = options.fetcher;
    this.includePopulatedPlaces = options.includePopulatedPlaces ?? true;
  }

  loadInitialCatalog(): Promise<GeoCatalog> {
    this.catalogPromise ??= loadWorldCountryDataset({
      baseUrl: this.baseUrl,
      ...(this.fetcher ? { fetcher: this.fetcher } : {}),
    }).then(async (dataset) => {
      if (!this.includePopulatedPlaces) return datasetToCatalog(dataset);
      const populatedPlaces = await loadWorldPopulatedPlacesDataset({
        baseUrl: this.baseUrl,
        ...(this.fetcher ? { fetcher: this.fetcher } : {}),
      });
      return datasetToCatalog(dataset, populatedPlaces);
    });
    return this.catalogPromise;
  }

  expandForSelection(): Promise<GeoCatalog> {
    return this.loadInitialCatalog();
  }
}

export function createProductionGeoCatalogProvider(
  options: WorldCountryGeoCatalogProviderOptions = {},
): GeoCatalogProvider {
  return new WorldCountryGeoCatalogProvider(options);
}
