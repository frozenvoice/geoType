import { z } from 'zod';

import { DEFAULT_GEO_CATALOG_BASE_URL } from './config';
import { GeoFeatureCollectionSchema } from './schemas';
import type { GeoFeature, GeoFeatureCollection } from './types';

/** Natural Earth's official 1:10m populated places release bundled by GeoType. */
export const NATURAL_EARTH_POPULATED_PLACES_SOURCE_VERSION = '5.1.2';
export const NATURAL_EARTH_POPULATED_PLACES_CATALOG_VERSION =
  `natural-earth-populated-places-${NATURAL_EARTH_POPULATED_PLACES_SOURCE_VERSION}`;
export const WORLD_PLACES_CATALOG_VERSION =
  `natural-earth-admin0-and-populated-places-5.1.1-${NATURAL_EARTH_POPULATED_PLACES_SOURCE_VERSION}`;
export const NATURAL_EARTH_POPULATED_PLACES_SOURCE = {
  name: 'Natural Earth 1:10m Populated Places',
  version: NATURAL_EARTH_POPULATED_PLACES_SOURCE_VERSION,
  scale: '1:10m',
  sourcePageUrl:
    'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/',
  downloadUrl:
    'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places.zip',
  license: 'Public domain',
  archiveSha256:
    'cd149186f03d2603e0410da399b980a4357d0ac32d3a2305a49ed3dffcc41d7b',
} as const;

export type WorldPopulatedPlacesDataFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class WorldPopulatedPlacesDataError extends Error {
  readonly resourceType = 'populated places' as const;
  readonly statusCode: number | null;
  readonly resourceUrl: string;

  constructor(options: {
    message: string;
    resourceUrl: string;
    statusCode?: number | null;
    cause?: unknown;
  }) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'WorldPopulatedPlacesDataError';
    this.statusCode = options.statusCode ?? null;
    this.resourceUrl = options.resourceUrl;
  }
}

function normalizeBaseUrl(baseUrl?: string | null): string {
  return (baseUrl?.trim() || `${DEFAULT_GEO_CATALOG_BASE_URL}/world`).replace(/\/+$/, '');
}

export function worldPopulatedPlacesDataUrls(baseUrl?: string | null): {
  placesDataUrl: string;
  placesIndexUrl: string;
} {
  const normalized = normalizeBaseUrl(baseUrl);
  return {
    placesDataUrl: `${normalized}/populated-places.json`,
    placesIndexUrl: `${normalized}/populated-places-index.json`,
  };
}

async function fetchJson(
  fetcher: WorldPopulatedPlacesDataFetcher,
  resourceUrl: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(resourceUrl, { cache: 'no-cache' });
  } catch (cause) {
    throw new WorldPopulatedPlacesDataError({
      message: 'Populated places network request failed.',
      resourceUrl,
      cause,
    });
  }
  if (!response.ok) {
    throw new WorldPopulatedPlacesDataError({
      message: `Populated places request failed with HTTP ${response.status}.`,
      resourceUrl,
      statusCode: response.status,
    });
  }
  try {
    return JSON.parse(await response.text()) as unknown;
  } catch (cause) {
    throw new WorldPopulatedPlacesDataError({
      message: 'Populated places response is not valid JSON.',
      resourceUrl,
      statusCode: response.status,
      cause,
    });
  }
}

async function fetchText(
  fetcher: WorldPopulatedPlacesDataFetcher,
  resourceUrl: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(resourceUrl, { cache: 'no-cache' });
  } catch (cause) {
    throw new WorldPopulatedPlacesDataError({
      message: 'Populated places index network request failed.',
      resourceUrl,
      cause,
    });
  }
  if (!response.ok) {
    throw new WorldPopulatedPlacesDataError({
      message: `Populated places index request failed with HTTP ${response.status}.`,
      resourceUrl,
      statusCode: response.status,
    });
  }
  return response.text();
}

function validateFeatureCollection(value: unknown, resourceUrl: string): GeoFeatureCollection {
  const result = GeoFeatureCollectionSchema.safeParse(value);
  if (!result.success) {
    throw new WorldPopulatedPlacesDataError({
      message: `Populated places payload failed schema validation: ${result.error.issues[0]?.message ?? 'unknown error'}.`,
      resourceUrl,
    });
  }
  const features = result.data.features as GeoFeature[];
  const invalid = features.find(
    (feature) =>
      (feature.featureType !== 'city' && feature.featureType !== 'town') ||
      feature.source !== 'natural-earth' ||
      feature.sourceVersion !== NATURAL_EARTH_POPULATED_PLACES_SOURCE_VERSION,
  );
  if (invalid) {
    throw new WorldPopulatedPlacesDataError({
      message: `Populated places feature ${invalid.id} has an unexpected source or feature type.`,
      resourceUrl,
    });
  }
  return { type: 'FeatureCollection', features };
}

export async function loadWorldPopulatedPlaces(options: {
  baseUrl?: string | null;
  fetcher?: WorldPopulatedPlacesDataFetcher;
} = {}): Promise<GeoFeature[]> {
  return (await loadWorldPopulatedPlacesDataset(options)).features;
}

export type WorldPopulatedPlacesDataset = {
  features: GeoFeature[];
  index: WorldPopulatedPlacesIndex;
};

export async function loadWorldPopulatedPlacesDataset(options: {
  baseUrl?: string | null;
  fetcher?: WorldPopulatedPlacesDataFetcher;
} = {}): Promise<WorldPopulatedPlacesDataset> {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const { placesDataUrl, placesIndexUrl } = worldPopulatedPlacesDataUrls(options.baseUrl);
  const [payload, indexPayload] = await Promise.all([
    fetchJson(fetcher, placesDataUrl),
    fetchText(fetcher, placesIndexUrl),
  ]);
  const index = WorldPopulatedPlacesIndexSchema.parse(JSON.parse(indexPayload) as unknown);
  const features = validateFeatureCollection(payload, placesDataUrl).features;
  if (index.featureCount !== features.length) {
    throw new WorldPopulatedPlacesDataError({
      message: `Populated places index count ${index.featureCount} does not match payload count ${features.length}.`,
      resourceUrl: placesIndexUrl,
    });
  }
  return { features, index };
}

export const WorldPopulatedPlacesIndexSchema = z.object({
  schemaVersion: z.literal(1),
  catalogVersion: z.literal(NATURAL_EARTH_POPULATED_PLACES_CATALOG_VERSION),
  generatedAt: z.string().datetime(),
  source: z.object({
    name: z.literal('Natural Earth 1:10m Populated Places'),
    version: z.literal(NATURAL_EARTH_POPULATED_PLACES_SOURCE_VERSION),
    scale: z.literal('1:10m'),
    sourcePageUrl: z.string().url(),
    downloadUrl: z.string().url(),
    license: z.literal('Public domain'),
    archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceDbfSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  featureCount: z.number().int().positive(),
  countryCount: z.number().int().positive(),
  capitalCount: z.number().int().nonnegative(),
  featureTypeCounts: z.object({ city: z.number().int().nonnegative(), town: z.number().int().nonnegative() }),
  languageFieldCounts: z.record(z.string().min(2), z.number().int().nonnegative()),
  sourceFeatureCount: z.number().int().positive(),
  skipped: z.record(z.string().min(1), z.number().int().nonnegative()),
  geoJsonSha256: z.string().regex(/^[a-f0-9]{64}$/),
  geoJsonByteSize: z.number().int().positive(),
});

export type WorldPopulatedPlacesIndex = z.infer<typeof WorldPopulatedPlacesIndexSchema>;
