import { z } from 'zod';

import { DEFAULT_GEO_CATALOG_BASE_URL } from './config';
import {
  boundingBoxContainsPoint,
  boundingBoxesEqual,
  calculateBoundingBox,
} from './geometry';
import {
  GeoAreaGeometrySchema,
  GeoBoundingBoxSchema,
  GeoPositionSchema,
} from './schemas';

export const NATURAL_EARTH_COUNTRY_SOURCE_VERSION = '5.1.1';
export const DEFAULT_WORLD_COUNTRY_DATA_BASE_URL = `${DEFAULT_GEO_CATALOG_BASE_URL}/world`;

const normalizedText = z.string().min(1).superRefine((value, context) => {
  if (value !== value.normalize('NFC')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Text must be Unicode NFC normalized.',
    });
  }
});

export const WorldCountryPropertiesSchema = z.object({
  id: z.string().regex(/^natural-earth:country:[A-Z]{3}$/),
  source: z.literal('natural-earth'),
  sourceVersion: z.literal(NATURAL_EARTH_COUNTRY_SOURCE_VERSION),
  featureType: z.literal('country'),
  naturalEarthCode: z.string().regex(/^[A-Z]{3}$/),
  isoAlpha2: z.string().regex(/^[A-Z]{2}$/).nullable(),
  isoAlpha3: z.string().regex(/^[A-Z]{3}$/).nullable(),
  name: normalizedText,
  nameKo: normalizedText.nullable(),
  nameEn: normalizedText,
  nameLocal: normalizedText,
  aliases: z.array(normalizedText).min(1),
  continentId: z.string().regex(/^natural-earth:continent:[a-z-]+$/),
  continentCode: z.enum([
    'asia',
    'europe',
    'africa',
    'north-america',
    'south-america',
    'oceania',
    'antarctica',
  ]),
  continentNameKo: normalizedText,
  continentNameEn: normalizedText,
  centroid: GeoPositionSchema,
  population: z.number().int().nonnegative(),
});

export const WorldCountryFeatureSchema = z
  .object({
    type: z.literal('Feature'),
    id: z.string().regex(/^natural-earth:country:[A-Z]{3}$/),
    bbox: GeoBoundingBoxSchema,
    properties: WorldCountryPropertiesSchema,
    geometry: GeoAreaGeometrySchema,
  })
  .superRefine((feature, context) => {
    if (feature.id !== feature.properties.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['properties', 'id'],
        message: 'GeoJSON feature and property ids must match.',
      });
    }
    if (!feature.id.endsWith(`:${feature.properties.naturalEarthCode}`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['properties', 'naturalEarthCode'],
        message: 'Natural Earth code must match the feature id.',
      });
    }
    const expectedBbox = calculateBoundingBox(feature.geometry);
    if (!boundingBoxesEqual(feature.bbox, expectedBbox)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bbox'],
        message: `bbox does not match country geometry; expected ${JSON.stringify(expectedBbox)}.`,
      });
    }
    if (!boundingBoxContainsPoint(feature.bbox, feature.properties.centroid)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['properties', 'centroid'],
        message: 'Country centroid must be within its bbox.',
      });
    }
  });

export const WorldCountryFeatureCollectionSchema = z
  .object({
    type: z.literal('FeatureCollection'),
    features: z.array(WorldCountryFeatureSchema).min(1),
  })
  .superRefine((collection, context) => {
    const ids = collection.features.map((feature) => feature.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['features'],
        message: 'Country feature ids must be unique.',
      });
    }
  });

export const WorldCountryIndexEntrySchema = WorldCountryPropertiesSchema.pick({
  id: true,
  naturalEarthCode: true,
  isoAlpha2: true,
  isoAlpha3: true,
  name: true,
  nameKo: true,
  nameEn: true,
  nameLocal: true,
  aliases: true,
  continentId: true,
  continentCode: true,
}).extend({
  centroid: GeoPositionSchema,
  bbox: GeoBoundingBoxSchema,
});

export const WorldContinentIndexEntrySchema = z.object({
  id: z.string().regex(/^natural-earth:continent:[a-z-]+$/),
  code: WorldCountryPropertiesSchema.shape.continentCode,
  nameKo: normalizedText,
  nameEn: normalizedText,
  countryCount: z.number().int().positive(),
  countryIds: z.array(z.string().regex(/^natural-earth:country:[A-Z]{3}$/)).min(1),
  centroid: GeoPositionSchema,
  bbox: GeoBoundingBoxSchema,
});

export const WorldCountryIndexSchema = z
  .object({
    schemaVersion: z.literal(1),
    catalogVersion: z.literal(
      `natural-earth-admin0-countries-${NATURAL_EARTH_COUNTRY_SOURCE_VERSION}`,
    ),
    generatedAt: z.string().datetime(),
    source: z.object({
      name: z.literal('Natural Earth Admin 0 – Countries'),
      version: z.literal(NATURAL_EARTH_COUNTRY_SOURCE_VERSION),
      scale: z.literal('1:10m'),
      sourcePageUrl: z.string().url(),
      downloadUrl: z.string().url(),
      license: z.literal('Public domain'),
      archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
      countriesGeoJsonSha256: z.string().regex(/^[a-f0-9]{64}$/),
      countriesGeoJsonByteSize: z.number().int().positive(),
    }),
    countryCount: z.number().int().positive(),
    isoCodeCounts: z.object({
      alpha2: z.number().int().nonnegative(),
      alpha3: z.number().int().nonnegative(),
      withoutIso: z.number().int().nonnegative(),
    }),
    continentCount: z.number().int().positive(),
    continents: z.array(WorldContinentIndexEntrySchema).min(1),
    countries: z.array(WorldCountryIndexEntrySchema).min(1),
  })
  .superRefine((index, context) => {
    if (index.countryCount !== index.countries.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['countryCount'],
        message: 'Country count must match index entries.',
      });
    }
    if (index.continentCount !== index.continents.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['continentCount'],
        message: 'Continent count must match index entries.',
      });
    }
    const countryIds = new Set(index.countries.map((country) => country.id));
    if (countryIds.size !== index.countries.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['countries'],
        message: 'Country index ids must be unique.',
      });
    }
    for (const continent of index.continents) {
      if (continent.countryCount !== continent.countryIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['continents'],
          message: `${continent.id} country count is inconsistent.`,
        });
      }
      for (const countryId of continent.countryIds) {
        if (!countryIds.has(countryId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['continents'],
            message: `${continent.id} references missing country ${countryId}.`,
          });
        }
      }
    }
  });

export type WorldCountryFeature = z.infer<typeof WorldCountryFeatureSchema>;
export type WorldCountryFeatureCollection = z.infer<
  typeof WorldCountryFeatureCollectionSchema
>;
export type WorldCountryIndex = z.infer<typeof WorldCountryIndexSchema>;

export type WorldCountryDataset = {
  collection: WorldCountryFeatureCollection;
  index: WorldCountryIndex;
};

export type WorldCountryDataFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class WorldCountryDataError extends Error {
  readonly resourceType: 'country boundaries' | 'country index';
  readonly statusCode: number | null;
  readonly resourceUrl: string;

  constructor(options: {
    message: string;
    resourceType: WorldCountryDataError['resourceType'];
    resourceUrl: string;
    statusCode?: number | null;
    cause?: unknown;
  }) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'WorldCountryDataError';
    this.resourceType = options.resourceType;
    this.resourceUrl = options.resourceUrl;
    this.statusCode = options.statusCode ?? null;
  }
}

function normalizeBaseUrl(baseUrl?: string | null): string {
  const candidate = baseUrl?.trim() || DEFAULT_WORLD_COUNTRY_DATA_BASE_URL;
  return candidate.replace(/\/+$/, '');
}

async function fetchJson(
  fetcher: WorldCountryDataFetcher,
  resourceUrl: string,
  resourceType: WorldCountryDataError['resourceType'],
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(resourceUrl, { cache: 'no-cache' });
  } catch (cause) {
    throw new WorldCountryDataError({
      message: `${resourceType} network request failed.`,
      resourceType,
      resourceUrl,
      cause,
    });
  }
  if (!response.ok) {
    throw new WorldCountryDataError({
      message: `${resourceType} request failed with HTTP ${response.status}.`,
      resourceType,
      resourceUrl,
      statusCode: response.status,
    });
  }
  try {
    return JSON.parse(await response.text()) as unknown;
  } catch (cause) {
    throw new WorldCountryDataError({
      message: `${resourceType} response is not valid JSON.`,
      resourceType,
      resourceUrl,
      statusCode: response.status,
      cause,
    });
  }
}

export function worldCountryDataUrls(baseUrl?: string | null): {
  countryDataUrl: string;
  countryIndexUrl: string;
} {
  const normalized = normalizeBaseUrl(baseUrl);
  return {
    countryDataUrl: `${normalized}/countries.geojson`,
    countryIndexUrl: `${normalized}/countries-index.json`,
  };
}

export async function loadWorldCountryDataset(options: {
  baseUrl?: string | null;
  fetcher?: WorldCountryDataFetcher;
} = {}): Promise<WorldCountryDataset> {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const { countryDataUrl, countryIndexUrl } = worldCountryDataUrls(options.baseUrl);
  const [collectionJson, indexJson] = await Promise.all([
    fetchJson(fetcher, countryDataUrl, 'country boundaries'),
    fetchJson(fetcher, countryIndexUrl, 'country index'),
  ]);
  const collection = WorldCountryFeatureCollectionSchema.parse(collectionJson);
  const index = WorldCountryIndexSchema.parse(indexJson);

  const featureIds = new Set(collection.features.map((feature) => feature.id));
  const indexIds = new Set(index.countries.map((country) => country.id));
  if (
    featureIds.size !== indexIds.size ||
    [...featureIds].some((featureId) => !indexIds.has(featureId))
  ) {
    throw new WorldCountryDataError({
      message: 'Country boundaries and country index contain different feature ids.',
      resourceType: 'country index',
      resourceUrl: countryIndexUrl,
    });
  }

  return { collection, index };
}
